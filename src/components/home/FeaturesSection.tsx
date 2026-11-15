import { Camera, ClipboardCheck, MapPinned, Route, SearchCheck, Workflow } from "lucide-react";

const FEATURES = [
  { number: "01", title: "Easy citizen reporting", text: "Capture the location, condition and context of a road issue in one report.", icon: Camera, className: "feature-item--large" },
  { number: "02", title: "Location-based tracking", text: "Keep a complaint connected to the road it concerns.", icon: MapPinned, className: "feature-item--map" },
  { number: "03", title: "Transparent status", text: "Follow updates with a complaint reference.", icon: SearchCheck, className: "feature-item--status" },
  { number: "04", title: "Authority management", text: "Authorized staff can review and assign work through dedicated dashboards.", icon: Workflow, className: "feature-item--authority" },
  { number: "05", title: "Complaint verification", text: "Reports can be reviewed before they move into action.", icon: ClipboardCheck, className: "feature-item--verify" },
  { number: "06", title: "Structured repair workflow", text: "Assignment and status history make each step easier to follow.", icon: Route, className: "feature-item--workflow" },
] as const;

export function FeaturesSection() {
  return (
    <section className="feature-section" aria-labelledby="feature-section-heading">
      <div className="feature-section__heading"><p className="living-kicker"><span className="living-kicker__line" /> TOOLS FOR A SHARED TASK</p><h2 id="feature-section-heading">From first signal<br /><em>to visible progress.</em></h2><p>Purposeful tools bring citizen reports and staff workflows into one clearer process.</p></div>
      <div className="feature-grid">
        {FEATURES.map(({ number, title, text, icon: Icon, className }) => <article className={`feature-item ${className}`} key={number}><div className="feature-item__top"><span>{number}</span><Icon aria-hidden="true" /></div><div><h3>{title}</h3><p>{text}</p></div></article>)}
      </div>
    </section>
  );
}
