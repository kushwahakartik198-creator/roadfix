import { Link, useLocation } from "react-router-dom";

export function Footer() {
  const { pathname } = useLocation();
  return (
    <footer className={`app-footer mt-auto border-t border-border bg-background py-6${pathname === "/" ? " app-footer--home" : ""}`}>
      <div className="app-footer__inner mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-4 px-4 sm:px-6 lg:px-8">
        <div className="app-footer__brand grid gap-1"><strong>ROADFIX</strong><span>Smarter Roads. Safer Cities.</span></div>
        <nav aria-label="Footer navigation" className="app-footer__links flex flex-row flex-wrap gap-x-5 gap-y-2">
          <Link to="/report">Citizen reporting</Link><Link to="/track">Complaint tracking</Link><Link to="/login">Staff login</Link>
        </nav>
        <p className="app-footer__notice">RoadFix — a civic-tech initiative, Agra. Not an official government service.</p>
      </div>
    </footer>
  );
}
