import * as React from "react";
import { Link, useLocation } from "react-router-dom";
import { ShieldAlert, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/types";

const NAV_ITEMS: readonly NavItem[] = [
  { title: "Home", href: "/" },
  { title: "Report", href: "/report" },
  { title: "Track", href: "/track" },
  { title: "Wards", href: "/wards" },
  { title: "Officer", href: "/officer" },
];

export function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const location = useLocation();

  // Close mobile menu when route changes
  React.useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Close mobile menu on Escape key
  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && isMobileMenuOpen) {
        setIsMobileMenuOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobileMenuOpen]);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* Skip to main content link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 min-h-[44px] flex items-center"
      >
        Skip to main content
      </a>

      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        {/* RoadFix wordmark with Lucide icon */}
        <Link
          to="/"
          className="flex items-center gap-2 text-lg font-bold tracking-tight text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md p-1 min-h-[44px]"
        >
          <ShieldAlert className="h-6 w-6 text-primary" aria-hidden="true" />
          <span>RoadFix</span>
          <span className="hidden border-l border-border pl-2 text-xs font-medium text-muted-foreground lg:inline">
            Civic issue reporting
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav aria-label="Main Navigation" className="hidden md:flex md:items-center md:gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center px-3 py-2 text-sm font-medium rounded-md min-h-[44px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isActive
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                {item.title}
              </Link>
            );
          })}
        </nav>

        {/* Mobile menu toggle button */}
        <button
          type="button"
          aria-expanded={isMobileMenuOpen}
          aria-controls="mobile-nav-menu"
          aria-label={isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="md:hidden flex shrink-0 items-center justify-center rounded-md border border-border bg-card p-2 min-h-[44px] min-w-[44px] text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {isMobileMenuOpen ? (
            <X className="h-6 w-6" aria-hidden="true" />
          ) : (
            <Menu className="h-6 w-6" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Collapsed Mobile Navigation Menu */}
      {isMobileMenuOpen && (
        <nav
          id="mobile-nav-menu"
          aria-label="Mobile Navigation"
          className="md:hidden border-b border-border bg-background px-4 pt-2 pb-4 space-y-1 shadow-lg"
        >
          {NAV_ITEMS.filter((item) => item.href !== "/officer").map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center w-full px-4 py-3 rounded-md text-base font-medium min-h-[44px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isActive
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-foreground hover:bg-secondary"
                )}
              >
                {item.title}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
