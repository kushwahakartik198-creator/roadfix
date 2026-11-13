import { MapPin } from "lucide-react";

export function AgraFocusSection() {
  return (
    <section className="agra-focus" aria-labelledby="agra-focus-heading">
      <div className="agra-focus__mark" aria-hidden="true"><MapPin /></div>
      <div className="agra-focus__copy">
        <p className="living-kicker"><span className="living-kicker__line" /> INITIAL TARGET CITY</p>
        <h2 id="agra-focus-heading">RoadFix starts<br /><em>with Agra.</em></h2>
        <p>Agra, Uttar Pradesh is RoadFix’s initial target city. The platform is designed to grow to more cities over time.</p>
      </div>
      <div className="agra-focus__locator" aria-hidden="true">
        <span className="agra-focus__locator-ring" /><span className="agra-focus__locator-core" />
        <span className="agra-focus__locator-label">AGRA / UTTAR PRADESH</span>
        <span className="agra-focus__locator-line" />
        <span className="agra-focus__locator-caption">A connected civic infrastructure platform</span>
      </div>
    </section>
  );
}
