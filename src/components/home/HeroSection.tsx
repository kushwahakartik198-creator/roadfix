import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { HeroGraphic } from "@/components/home/HeroGraphic";
import { ArrowDown, ArrowRight, Search } from "lucide-react";

export function HeroSection() {
  return (
    <section aria-labelledby="hero-heading" className="living-hero">
      <div className="living-hero__copy">
        <p className="living-kicker"><span className="living-kicker__line" /> CIVIC INFRASTRUCTURE / AGRA</p>
        <h1 id="hero-heading">Smarter Roads. <br /><em>Safer Cities.</em></h1>
        <p className="living-hero__lead">
          Every road issue deserves attention. RoadFix connects citizens and municipal authorities to report, verify and resolve damaged roads through one transparent platform.
        </p>
        <div className="living-hero__actions">
          <Button asChild size="lg" className="living-button living-button--primary">
            <Link to="/report"><span>Report a Road Issue</span><ArrowRight aria-hidden="true" /></Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="living-button living-button--secondary">
            <Link to="/track"><Search aria-hidden="true" /><span>Track a Complaint</span></Link>
          </Button>
        </div>
        <a className="living-hero__scroll" href="#city-journey"><span>FOLLOW THE ROAD</span><ArrowDown aria-hidden="true" /></a>
      </div>
      <div className="living-hero__visual">
        <HeroGraphic />
      </div>
      <div className="living-hero__bottomline" aria-hidden="true"><span>ROADFIX / PUBLIC INFRASTRUCTURE</span><span>01 — THE CITY AS IT IS</span></div>
    </section>
  );
}
