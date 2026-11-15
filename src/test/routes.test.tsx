import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { AuthProvider } from "@/features/auth/AuthContext";
import { routes } from "@/app/router";

function renderWithRoute(initialEntry = "/") {
  const testRouter = createMemoryRouter(routes, {
    initialEntries: [initialEntry],
  });
  return render(<AuthProvider><RouterProvider router={testRouter} /></AuthProvider>);
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
    const footerBrand = screen.getByText("ROADFIX").closest(".app-footer__brand");
    expect(footerBrand?.querySelectorAll(":scope > *")).toHaveLength(2);
    const footerLinks = screen.getByRole("navigation", { name: "Footer navigation" });
    expect(footerLinks).toHaveClass("flex", "flex-row", "flex-wrap", "gap-x-5", "gap-y-2");

    // Exactly one <h1> on the page
    const h1Headings = screen.getAllByRole("heading", { level: 1 });
    expect(h1Headings).toHaveLength(1);
    expect(h1Headings[0]).toHaveTextContent("Smarter Roads. Safer Cities.");

    // Current Phase B hero copy
    expect(screen.getByText(/civic infrastructure \/ agra/i)).toBeInTheDocument();
    expect(screen.getByText(/every road issue deserves attention\. roadfix connects citizens and municipal authorities/i)).toBeInTheDocument();

    // Hero & Final CTAs
    const reportLinks = screen.getAllByRole("link", { name: /report a road issue/i });
    expect(reportLinks.length).toBeGreaterThanOrEqual(2);
    reportLinks.forEach((link) => expect(link).toHaveAttribute("href", "/report"));

    const trackComplaintHeroLink = screen.getByRole("link", { name: /^track a complaint$/i });
    expect(trackComplaintHeroLink).toHaveAttribute("href", "/track");

    // Interactive five-stage scroll story and its real page anchors
    expect(screen.getByRole("heading", { name: /from road damage to recorded repair/i, level: 2 })).toBeInTheDocument();
    for (const stage of ["Road damage", "Citizen report", "Municipal review", "Officer action", "Resolution"]) {
      expect(screen.getByRole("button", { name: new RegExp(stage, "i") })).toBeInTheDocument();
    }

    // Platform preview is explicitly illustrative and does not imply live records
    expect(screen.getByRole("heading", { name: /one place to follow the road ahead/i, level: 2 })).toBeInTheDocument();
    expect(screen.getByText(/illustrative interface preview · sample records, not live data/i)).toBeInTheDocument();
    expect(screen.getByText(/RF-AG-ILLUSTRATIVE-01/i)).toBeInTheDocument();

    // Six feature treatments
    expect(screen.getByRole("heading", { name: /from first signal to visible progress/i, level: 2 })).toBeInTheDocument();
    for (const feature of ["Easy citizen reporting", "Location-based tracking", "Transparent status", "Authority management", "Complaint verification", "Structured repair workflow"]) {
      expect(screen.getByRole("heading", { name: feature, level: 3 })).toBeInTheDocument();
    }

    // Agra Focus & Final CTA
    expect(
      screen.getByRole("heading", {
        name: /^roadfix starts with agra\.$/i,
        level: 2,
      })
    ).toBeInTheDocument();
    expect(screen.getByText(/built to make road maintenance more transparent, one report at a time/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /^better roads begin with one report\.$/i,
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

    expect(screen.getByRole("heading", { name: /track a report/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/rf-ag-xxxxxxxx/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/reference number/i)).toBeInTheDocument();
  });

  it("renders the WardExplorer at route '/wards'", () => {
    renderWithRoute("/wards");

    expect(screen.getByRole("heading", { name: /explore wards/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search wards by name or code…/i)).toBeInTheDocument();
  });

  it("renders NotFoundPage at unknown route '/does-not-exist'", () => {
    renderWithRoute("/does-not-exist");

    expect(screen.getByRole("heading", { name: /page not found/i, level: 1 })).toBeInTheDocument();

    const homeLink = screen.getByRole("link", { name: /return to home/i });
    expect(homeLink).toBeInTheDocument();
    expect(homeLink).toHaveAttribute("href", "/");
  });
});
