import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import fs from "node:fs";
import path from "node:path";
import { ReportPage } from "@/pages/ReportPage";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: {
    listWards: vi.fn(),
    findNearbyPotholes: vi.fn(),
    createIssue: vi.fn(),
  },
}));

vi.mock("@/components/report/LocationMap", () => ({
  default: () => <div data-testid="location-map" />,
}));

function renderReport() {
  const router = createMemoryRouter(
    [
      { path: "/report", element: <ReportPage /> },
      { path: "/track", element: <p>Track page</p> },
      { path: "/", element: <p>Home page</p> },
    ],
    { initialEntries: ["/report"] },
  );
  return { ...render(<RouterProvider router={router} />), router };
}

async function submitSyntheticReport() {
  fireEvent.change(screen.getByLabelText(/ward \(area\)/i), { target: { value: "ward-1" } });
  fireEvent.change(screen.getByLabelText(/landmark \/ exact spot/i), { target: { value: "Near the synthetic test crossing" } });
  fireEvent.click(screen.getByRole("button", { name: /next: issue details/i }));

  fireEvent.click(screen.getByRole("button", { name: "Garbage / Dumping" }));
  fireEvent.click(screen.getByRole("button", { name: "High" }));
  fireEvent.change(screen.getByLabelText(/description/i), { target: { value: "Synthetic report description for UI regression coverage." } });
  fireEvent.click(screen.getByRole("button", { name: /next: review/i }));
  fireEvent.click(screen.getByRole("button", { name: /submit report/i }));
  await screen.findByText("RF-AG-EZFEXD4F");
}

describe("targeted report-page UI regressions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listWards).mockResolvedValue([
      { id: "ward-1", code: "SYN-01", name: "Synthetic Ward", lat: 27.18, lng: 78.02, active: true, wardNumber: "1", description: null },
    ]);
    vi.mocked(api.findNearbyPotholes).mockResolvedValue([]);
    vi.mocked(api.createIssue).mockResolvedValue({
      id: "synthetic-issue",
      reference: "RF-AG-EZFEXD4F",
      status: "submitted",
      title: "Synthetic pothole report",
    });
  });

  it("keeps issue labels in an auto-fit grid and severity in its own following row", async () => {
    renderReport();
    await screen.findByRole("option", { name: /synthetic ward/i });
    fireEvent.change(screen.getByLabelText(/ward \(area\)/i), { target: { value: "ward-1" } });
    fireEvent.change(screen.getByLabelText(/landmark \/ exact spot/i), { target: { value: "Near a synthetic crossing" } });
    fireEvent.click(screen.getByRole("button", { name: /next: issue details/i }));

    const grid = document.querySelector<HTMLElement>(".report-issue-grid");
    expect(grid).not.toBeNull();
    expect(grid?.style.gridTemplateColumns).toBe("repeat(auto-fit, minmax(190px, 1fr))");
    expect(grid?.querySelectorAll("button")).toHaveLength(9);
    const issueSection = grid?.parentElement;
    expect(issueSection?.nextElementSibling).toHaveTextContent("Severity");
    expect(screen.getByRole("button", { name: "Waterlogging" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Streetlight" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Water Pipe Leak" })).toBeInTheDocument();

    const styles = fs.readFileSync(path.resolve(__dirname, "../index.css"), "utf8");
    expect(styles).toMatch(/\.report-issue-button__label\s*\{[^}]*overflow-wrap:\s*anywhere;[^}]*word-break:\s*normal;[^}]*white-space:\s*normal;/s);
  });

  it("shows the generated reference, copies it, resets the label, and hides the form after success", async () => {
    renderReport();
    await screen.findByRole("option", { name: /synthetic ward/i });
    await submitSyntheticReport();

    expect(api.createIssue).toHaveBeenCalledTimes(1);
    expect(screen.getByText("RF-AG-EZFEXD4F")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /submit report/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /step 3/i })).not.toBeInTheDocument();

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    vi.useFakeTimers();
    try {
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Copy" }));
        await Promise.resolve();
      });
      expect(writeText).toHaveBeenCalledWith("RF-AG-EZFEXD4F");
      expect(screen.getByRole("button", { name: "Copied ✓" })).toBeInTheDocument();
      await act(async () => { vi.advanceTimersByTime(1500); });
      expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("warns about nearby potholes with public match details and still allows submission", async () => {
    vi.mocked(api.findNearbyPotholes).mockResolvedValueOnce([
      { reference: "RF-AG-NEAR00001", status: "under_review", distanceMeters: 12 },
      { reference: "RF-AG-NEAR00002", status: "in_progress", distanceMeters: 48 },
    ]);
    renderReport();
    await screen.findByRole("option", { name: /synthetic ward/i });
    fireEvent.change(screen.getByLabelText(/ward \(area\)/i), { target: { value: "ward-1" } });

    expect(await screen.findByText("A similar pothole may already have been reported nearby.")).toBeInTheDocument();
    const matchItems = screen.getAllByRole("listitem").map((item) => item.textContent ?? "");
    expect(matchItems).toContain("RF-AG-NEAR00001 · under review · approximately 12 metres away");
    expect(matchItems).toContain("RF-AG-NEAR00002 · in progress · approximately 48 metres away");
    expect(api.findNearbyPotholes).toHaveBeenCalledTimes(1);
    expect(api.findNearbyPotholes).toHaveBeenCalledWith(27.18, 78.02);

    fireEvent.change(screen.getByLabelText(/landmark \/ exact spot/i), { target: { value: "A separate crossing" } });
    expect(api.findNearbyPotholes).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /next: issue details/i }));
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: "A different pothole at this crossing." } });
    fireEvent.click(screen.getByRole("button", { name: /next: review/i }));
    expect(screen.getByText("A similar pothole may already have been reported nearby.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /submit report/i }));
    expect(await screen.findByText("Report submitted successfully")).toBeInTheDocument();
    expect(api.createIssue).toHaveBeenCalledTimes(1);
  });

  it("falls back to document copy when clipboard access is unavailable", async () => {
    renderReport();
    await screen.findByRole("option", { name: /synthetic ward/i });
    await submitSyntheticReport();

    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(execCommand).toHaveBeenCalledWith("copy"));
    expect(screen.getByRole("button", { name: "Copied ✓" })).toBeInTheDocument();
  });

  it.each([360, 390, 768, 1024, 1440])("keeps report success content width-constrained at %i px", async (width) => {
    window.innerWidth = width;
    window.dispatchEvent(new Event("resize"));
    renderReport();
    await screen.findByRole("option", { name: /synthetic ward/i });
    await submitSyntheticReport();

    expect(document.querySelector(".report-success-card")).toHaveClass("max-w-full", "min-w-0");
    expect(document.querySelector(".report-success-reference")).toHaveClass("flex-wrap", "max-w-full");
    expect(document.querySelector(".report-success-reference__value")).toHaveClass("max-w-full");
  });
});
