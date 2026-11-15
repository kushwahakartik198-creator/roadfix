import { Link } from "react-router-dom";
import { ArrowRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FinalCtaSection() {
  return (
    <section className="living-close" aria-labelledby="final-cta-heading">
      <div className="living-close__grid" aria-hidden="true" />
      <div className="living-close__content">
        <p className="living-kicker"><span className="living-kicker__line" /> THE NEXT STEP STARTS HERE</p>
        <h2 id="final-cta-heading">Better roads begin<br /><em>with one report.</em></h2>
        <p>Share the location and details so the issue can be reviewed and followed.</p>
        <div className="living-hero__actions living-close__actions">
          <Button asChild size="lg" className="living-button living-button--primary">
            <Link to="/report"><span>Report a Road Issue</span><ArrowRight aria-hidden="true" /></Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="living-button living-button--secondary">
            <Link to="/track"><Search aria-hidden="true" /><span>Track Your Complaint</span></Link>
          </Button>
        </div>
      </div>
      <div className="living-close__signal" aria-hidden="true"><span>RF</span><i /><i /><i /></div>
      <span className="living-close__edge" aria-hidden="true">ROADFIX / REPORT · TRACK · REPAIR</span>
    </section>
  );
}
