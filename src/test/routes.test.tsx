import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { routes } from "@/app/router";

function renderWithRoute(initialEntry = "/") {
  const testRouter = createMemoryRouter(routes, {
    initialEntries: [initialEntry],
  });
  return render(<RouterProvider router={testRouter} />);
}

describe("Route Rendering Tests", () => {
  it("renders the shell and HomePage content at route '/'", () => {
    renderWithRoute("/");

    // AppShell Landmarks & Content
    expect(screen.getByRole("banner")).toBeInTheDocument(); // <header>
    expect(screen.getByRole("main")).toBeInTheDocument(); // <main>
    expect(screen.getByRole("contentinfo")).toBeInTheDocument(); // <footer>

    // Wordmark
    expect(screen.getByText("RoadFix")).toBeInTheDocument();

    // Navigation links in header (incl. Wards)
    expect(screen.getByRole("navigation", { name: "Main Navigation" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^home$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^report$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^track$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^wards$/i })).toBeInTheDocument();

    // Exact required footer text
    const expectedFooter =
      "RoadFix — a civic-tech initiative, Agra. Not an official government service.";
    expect(screen.getByText(expectedFooter)).toBeInTheDocument();

    // Exactly one <h1> on the page
    const h1Headings = screen.getAllByRole("heading", { level: 1 });
    expect(h1Headings).toHaveLength(1);
    expect(h1Headings[0]).toHaveTextContent("Smarter Roads. Safer Cities.");

    // Eyebrow & subtitle
    expect(screen.getByText(/civic infrastructure intelligence/i)).toBeInTheDocument();
    expect(
      screen.getByText(/report potholes\. track road repairs\. help make agra's roads safer\./i)
    ).toBeInTheDocument();

    // Hero & Final CTAs
    const reportLinks = screen.getAllByRole("link", { name: /report a pothole/i });
    expect(reportLinks.length).toBeGreaterThanOrEqual(2);
    reportLinks.forEach((link) => expect(link).toHaveAttribute("href", "/report"));

    const trackComplaintHeroLink = screen.getByRole("link", { name: /^track a complaint$/i });
    expect(trackComplaintHeroLink).toHaveAttribute("href", "/track");

    // How It Works headings (updated copy)
    expect(screen.getByRole("heading", { name: /^how roadfix works$/i, level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^spot and document$/i, level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^submit and track$/i, level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^work towards safer roads$/i, level: 3 })).toBeInTheDocument();

    // Why RoadFix headings
    expect(screen.getByRole("heading", { name: /^why roadfix$/i, level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^citizen participation$/i, level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^transparent complaint tracking$/i, level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^better visibility into road issues$/i, level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^geographical awareness$/i, level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^a more organised approach$/i, level: 3 })).toBeInTheDocument();

    // Agra Focus & Final CTA
    expect(
      screen.getByRole("heading", {
        name: /^built for better roads, starting with agra\.$/i,
        level: 2,
      })
    ).toBeInTheDocument();
    expect(screen.getByText(/illustrative schematic — not live municipal data\./i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /^every safer road starts with a report\.$/i,
        level: 2,
      })
    ).toBeInTheDocument();

    // Unsupported claims check
    const pageText = document.body.textContent || "";
    expect(pageText).not.toMatch(/agra municipal corporation/i);
    expect(pageText).not.toMatch(/nagar nigam/i);
    expect(pageText).not.toMatch(/\b\d+%\b/);
  });

  it("renders the working ReportPage at route '/report'", () => {
    renderWithRoute("/report");

    expect(screen.getByRole("heading", { name: /step 1 — where is the issue\?/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/ward \(area\)/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/near sadar bazar police chowki/i)).toBeInTheDocument();
    expect(screen.getByText(/report a civic issue/i)).toBeInTheDocument();
  });

  it("renders the working TrackPage at route '/track'", () => {
    renderWithRoute("/track");

    expect(screen.getByRole("heading", { name: /track your report/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/rf-ag-a1b2c3d4/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/reference number/i)).toBeInTheDocument();
  });

  it("renders the WardExplorer at route '/wards'", () => {
    renderWithRoute("/wards");

    expect(screen.getByRole("heading", { name: /explore wards/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search wards by name or code…/i)).toBeInTheDocument();
  });

  it("renders OfficerPage at route '/officer'", () => {
    renderWithRoute("/officer");

    expect(screen.getByRole("heading", { name: /officer context/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/acting officer/i)).toBeInTheDocument();
  });

  it("renders NotFoundPage at unknown route '/does-not-exist'", () => {
    renderWithRoute("/does-not-exist");

    expect(screen.getByRole("heading", { name: /page not found/i, level: 1 })).toBeInTheDocument();

    const homeLink = screen.getByRole("link", { name: /return to home/i });
    expect(homeLink).toBeInTheDocument();
    expect(homeLink).toHaveAttribute("href", "/");
  });
});
