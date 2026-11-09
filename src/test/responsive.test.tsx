import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { routes } from "@/app/router";
import fs from "fs";
import path from "path";

describe("Responsive Layout & Viewport Verification (360px, 390px, 768px, 1024px, 1440px)", () => {
  it("renders properly at 360px and 390px mobile viewports with accessible touch targets and no horizontal overflow", () => {
    const mobileWidths = [360, 390];

    for (const width of mobileWidths) {
      window.innerWidth = width;
      window.innerHeight = 640;
      window.dispatchEvent(new Event("resize"));

      const router = createMemoryRouter(routes, { initialEntries: ["/"] });
      const { container, unmount } = render(<RouterProvider router={router} />);

      // Mobile menu toggle button exists and has min 44x44px touch target classes
      const toggleButton = screen.getByRole("button", { name: /open navigation menu/i });
      expect(toggleButton).toBeInTheDocument();
      expect(toggleButton.className).toMatch(/min-h-\[44px\]/);
      expect(toggleButton.className).toMatch(/min-w-\[44px\]/);

      // Hero action button has accessible touch target (using getAllByRole)
      const heroCtaButton = screen.getAllByRole("link", { name: /report a pothole/i })[0];
      expect(heroCtaButton).toBeDefined();
      expect(heroCtaButton?.className).toMatch(/min-h-\[48px\]/);

      // Open mobile menu and check touch target sizes on navigation links inside the mobile menu
      fireEvent.click(toggleButton);
      const mobileNav = screen.getByRole("navigation", { name: "Mobile Navigation" });
      const mobileNavLinks = mobileNav.querySelectorAll("a");
      expect(mobileNavLinks.length).toBe(4);
      for (const link of mobileNavLinks) {
        expect(link.className).toMatch(/min-h-\[44px\]/);
      }

      // Ensure no root elements enforce fixed widths greater than viewport width
      const fullWidthContainers = container.querySelectorAll(".w-screen, [style*='width']");
      for (const el of fullWidthContainers) {
        expect((el as HTMLElement).style.width).not.toMatch(/[4-9]\d\dpx/);
      }

      unmount();
    }
  });

  it("renders desktop navigation and hides mobile menu at 768px (tablet), 1024px, and 1440px viewports", () => {
    const viewports = [768, 1024, 1440];

    for (const width of viewports) {
      window.innerWidth = width;
      window.innerHeight = 900;
      window.dispatchEvent(new Event("resize"));

      const router = createMemoryRouter(routes, { initialEntries: ["/"] });
      const { unmount } = render(<RouterProvider router={router} />);

      const desktopNav = screen.getByRole("navigation", { name: "Main Navigation" });
      expect(desktopNav).toBeInTheDocument();
      expect(desktopNav.className).toContain("md:flex");

      const toggleButton = screen.getByRole("button", { name: /open navigation menu/i });
      expect(toggleButton.className).toContain("md:hidden");

      unmount();
    }
  });

  it("verifies visible focus ring styling across interactive navigation and buttons", async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(routes, { initialEntries: ["/"] });
    render(<RouterProvider router={router} />);

    // Tab to skip link
    await user.tab();
    const skipLink = screen.getByRole("link", { name: /skip to main content/i });
    expect(skipLink).toHaveFocus();
    expect(skipLink.className).toContain("focus:ring-2");
    expect(skipLink.className).toContain("focus:ring-ring");

    // Tab to wordmark link
    await user.tab();
    const wordmarkLink = screen.getByRole("link", { name: /roadfix/i });
    expect(wordmarkLink).toHaveFocus();
    expect(wordmarkLink.className).toContain("focus-visible:ring-2");
    expect(wordmarkLink.className).toContain("focus-visible:ring-ring");
  });

  it("verifies prefers-reduced-motion media query disables non-essential animations in global CSS", () => {
    const cssPath = path.resolve(__dirname, "../index.css");
    const cssContent = fs.readFileSync(cssPath, "utf-8");

    expect(cssContent).toContain("@media (prefers-reduced-motion: reduce)");
    expect(cssContent).toContain("animation-duration: 0.01ms !important");
    expect(cssContent).toContain("transition-duration: 0.01ms !important");
  });
});
