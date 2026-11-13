import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/features/auth/AuthContext";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { TrackPage } from "@/pages/TrackPage";
import { OfficerPage } from "@/pages/OfficerPage";
import { api } from "@/lib/api";
import { useAuth } from "@/features/auth/useAuth";
import { Header } from "@/components/layout/Header";

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    Navigate: ({ to }: { to: string }) => (
      <div data-testid="redirect" data-to={to}>
        Redirect
      </div>
    ),
  };
});

vi.mock("@/lib/api", () => ({
  api: {
    getSession: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    trackIssue: vi.fn(),
    getIssueHistory: vi.fn(),
    listIssues: vi.fn(),
    listOfficerIssues: vi.fn(),
    createIssue: vi.fn(),
  },
  setCsrfToken: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Phase D frontend contracts", () => {
  const staffSession = {
    user: { id: "staff-1", displayName: "Test Officer", role: "officer" as const, officerId: "officer-1", wardId: "ward-1" },
    csrfToken: "test-csrf-token",
    expiresAt: "2026-12-01T00:00:00.000Z",
  };
  function AuthHarness() {
    const { user, refresh } = useAuth();
    return <><p>Signed in as: {user?.displayName ?? "Anonymous"}</p><button onClick={() => void refresh()}>Bootstrap session</button></>;
  }
  function renderAuthHarness() {
    return render(<AuthProvider><MemoryRouter><Header /><AuthHarness /></MemoryRouter></AuthProvider>);
  }

  it("clears auth state and updates navigation only after successful logout", async () => {
    vi.mocked(api.getSession).mockResolvedValueOnce(staffSession);
    vi.mocked(api.logout).mockResolvedValueOnce({ loggedOut: true });
    renderAuthHarness();
    expect(await screen.findByText("Signed in as: Test Officer")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Log out" })[0]!);
    expect(await screen.findByText("Signed in as: Anonymous")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Staff login" })).toBeInTheDocument();
    expect(api.logout).toHaveBeenCalledTimes(1);
  });

  it("keeps auth and provides a generic retry after a server logout failure", async () => {
    vi.mocked(api.getSession).mockResolvedValueOnce(staffSession);
    vi.mocked(api.logout).mockRejectedValueOnce(new Error("CSRF secret and database detail"));
    renderAuthHarness();
    expect(await screen.findByText("Signed in as: Test Officer")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Log out" })[0]!);
    expect(await screen.findByRole("alert")).toHaveTextContent("Logout could not be confirmed. Your sign-in state is unchanged; please retry.");
    expect(screen.getByText("Signed in as: Test Officer")).toBeInTheDocument();
    expect(screen.queryByText(/CSRF secret|database detail/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Retry logout" }).length).toBeGreaterThan(0);
  });

  it("preserves auth after a network interruption and a successful session bootstrap", async () => {
    vi.mocked(api.getSession).mockResolvedValue(staffSession);
    vi.mocked(api.logout).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderAuthHarness();
    expect(await screen.findByText("Signed in as: Test Officer")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Log out" })[0]!);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bootstrap session" }));
    expect(await screen.findByText("Signed in as: Test Officer")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(api.getSession).toHaveBeenCalledTimes(2);
  });

  it("allows retry after failure and prevents concurrent logout requests", async () => {
    vi.mocked(api.getSession).mockResolvedValueOnce(staffSession);
    let completeLogout!: () => void;
    vi.mocked(api.logout)
      .mockRejectedValueOnce(new Error("rejected origin"))
      .mockImplementationOnce(() => new Promise<{ loggedOut: boolean }>((resolve) => { completeLogout = () => resolve({ loggedOut: true }); }));
    renderAuthHarness();
    expect(await screen.findByText("Signed in as: Test Officer")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Log out" })[0]!);
    const retry = await screen.findAllByRole("button", { name: "Retry logout" });
    fireEvent.click(retry[0]!);
    fireEvent.click(retry[0]!);
    expect(api.logout).toHaveBeenCalledTimes(2);
    expect(retry[0]!).toBeDisabled();
    completeLogout();
    expect(await screen.findByText("Signed in as: Anonymous")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the logout control disabled while a request is pending", async () => {
    vi.mocked(api.getSession).mockResolvedValueOnce(staffSession);
    let completeLogout!: () => void;
    vi.mocked(api.logout).mockImplementationOnce(() => new Promise<{ loggedOut: boolean }>((resolve) => { completeLogout = () => resolve({ loggedOut: true }); }));
    renderAuthHarness();
    expect(await screen.findByText("Signed in as: Test Officer")).toBeInTheDocument();
    const logout = screen.getAllByRole("button", { name: "Log out" })[0]!;
    fireEvent.click(logout);
    const pendingButtons = await screen.findAllByRole("button", { name: "Logging out…" });
    expect(pendingButtons.every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    fireEvent.click(logout);
    expect(api.logout).toHaveBeenCalledTimes(1);
    completeLogout();
    expect(await screen.findByText("Signed in as: Anonymous")).toBeInTheDocument();
  });

  it("redirects unauthenticated staff routes to login while preserving a safe destination", async () => {
    vi.mocked(api.getSession).mockRejectedValueOnce(
      Object.assign(new Error("unauthorized"), { status: 401 })
    );
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/officer"]}>
          <Routes>
            <Route path="/login" element={<p>Staff login page</p>} />
            <Route element={<RequireAuth />}>
              <Route path="/officer" element={<p>Protected officer page</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );
    expect(await screen.findByTestId("redirect")).toHaveAttribute("data-to", "/login");
    expect(screen.queryByText("Protected officer page")).not.toBeInTheDocument();
  });

  it("renders public tracking fields only, without photos or private notes", async () => {
    vi.mocked(api.trackIssue).mockResolvedValueOnce({
      reference: "RF-AG-AB12CD34",
      status: "resolved",
      submittedAt: "2026-01-01T00:00:00Z",
      lastUpdatedAt: "2026-01-02T00:00:00Z",
      locationDescription: "Near public park",
    });
    vi.mocked(api.getIssueHistory).mockResolvedValueOnce([
      {
        eventType: "status_change",
        fromStatus: "in_progress",
        toStatus: "resolved",
        createdAt: "2026-01-02T00:00:00Z",
      },
    ]);
    render(
      <MemoryRouter>
        <TrackPage />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByLabelText("Reference number"), {
      target: { value: "RF-AG-AB12CD34" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Track" }));
    expect(await screen.findByText("Near public park")).toBeInTheDocument();
    expect(
      screen.queryByText(/reporter contact|rejection reason|resolution note/i)
    ).not.toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("renders an unassigned officer complaint as a restricted summary", async () => {
    vi.mocked(api.getSession).mockResolvedValueOnce(staffSession);
    vi.mocked(api.listOfficerIssues).mockResolvedValueOnce({
      data: [{ reference: "RF-AG-AB12CD34", status: "submitted", category: "pothole", wardId: "ward-1", submittedAt: "2026-01-01T00:00:00Z" }],
      total: 1,
      page: 1,
      pageSize: 50,
    });
    render(<AuthProvider><MemoryRouter><OfficerPage /></MemoryRouter></AuthProvider>);
    expect(await screen.findByText(/RF-AG-AB12CD34/)).toBeInTheDocument();
    expect(screen.getByText(/pothole.*Ward ward-1/)).toBeInTheDocument();
    expect(screen.getByText(/Restricted summary shown/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show reporter contact" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load private photos" })).not.toBeInTheDocument();
    expect(screen.queryByText(/secret description|rejection note|resolution note/i)).not.toBeInTheDocument();
  });

  it("keeps reporter fields optional for anonymous submission and nested pagination", async () => {
    const anonymous = {
      wardId: "ward-1",
      category: "pothole" as const,
      description: "Large pothole on the road",
      lat: 27.18,
      lng: 78.02,
    };
    expect(anonymous).not.toHaveProperty("reporterContact");
    vi.mocked(api.listIssues).mockResolvedValueOnce({ data: [], total: 0, page: 1, pageSize: 20 });
    await expect(api.listIssues({ page: 1, pageSize: 20 })).resolves.toEqual({
      data: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
  });
});
