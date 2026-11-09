import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { routes } from "@/app/router";

function renderNavigation(initialEntry = "/") {
  const router = createMemoryRouter(routes, {
    initialEntries: [initialEntry],
  });
  return {
    user: userEvent.setup(),
    ...render(<RouterProvider router={router} />),
  };
}

describe("Navigation & Accessibility Tests", () => {
  it("renders skip to main content link as first focusable landmark", () => {
    renderNavigation("/");

    const skipLink = screen.getByRole("link", { name: /skip to main content/i });
    expect(skipLink).toBeInTheDocument();
    expect(skipLink).toHaveAttribute("href", "#main-content");
  });

  it("sets aria-current='page' exclusively on active route", () => {
    renderNavigation("/");

    const desktopNav = screen.getByRole("navigation", { name: "Main Navigation" });
    const homeLink = screen.getByRole("link", { name: /^home$/i });
    const reportLink = screen.getByRole("link", { name: /^report$/i });

    expect(desktopNav).toContainElement(homeLink);
    expect(homeLink).toHaveAttribute("aria-current", "page");
    expect(reportLink).not.toHaveAttribute("aria-current");
  });

  it("switches aria-current='page' when navigating to a different route", () => {
    renderNavigation("/report");

    const homeLink = screen.getByRole("link", { name: /^home$/i });
    const reportLink = screen.getByRole("link", { name: /^report$/i });

    expect(homeLink).not.toHaveAttribute("aria-current");
    expect(reportLink).toHaveAttribute("aria-current", "page");
  });

  it("supports keyboard tab navigation to links with focusable order", async () => {
    const { user } = renderNavigation("/");

    // Tab through elements starting from the skip link
    await user.tab();
    const skipLink = screen.getByRole("link", { name: /skip to main content/i });
    expect(skipLink).toHaveFocus();

    // Next focusable is the wordmark link
    await user.tab();
    const wordmarkLink = screen.getByRole("link", { name: /roadfix/i });
    expect(wordmarkLink).toHaveFocus();

    // Next focusable is the Home link
    await user.tab();
    const homeLink = screen.getByRole("link", { name: /^home$/i });
    expect(homeLink).toHaveFocus();
  });

  it("manages mobile navigation toggle aria-expanded state and closes on Escape", async () => {
    renderNavigation("/");

    const toggleButton = screen.getByRole("button", { name: /open navigation menu/i });
    expect(toggleButton).toBeInTheDocument();
    expect(toggleButton).toHaveAttribute("aria-expanded", "false");
    expect(toggleButton).toHaveAttribute("aria-controls", "mobile-nav-menu");

    // Open the mobile menu
    fireEvent.click(toggleButton);
    expect(toggleButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /close navigation menu/i })).toBeInTheDocument();

    const mobileMenu = screen.getByRole("navigation", { name: "Mobile Navigation" });
    expect(mobileMenu).toBeInTheDocument();

    // Press Escape to close
    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    expect(toggleButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation", { name: "Mobile Navigation" })).not.toBeInTheDocument();
  });
});
