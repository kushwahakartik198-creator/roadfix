import { ArrowUpRight, CircleDot, MapPin, ShieldCheck } from "lucide-react";

const SAMPLE_REPORTS = [
  { ref: "RF-AG-ILLUSTRATIVE-01", area: "Illustrative location A", category: "Road surface", status: "Under review", tone: "review" },
  { ref: "RF-AG-ILLUSTRATIVE-02", area: "Illustrative location B", category: "Pothole", status: "Assigned", tone: "assigned" },
  { ref: "RF-AG-ILLUSTRATIVE-03", area: "Illustrative location C", category: "Road damage", status: "Resolved", tone: "resolved" },
] as const;

export function PlatformPreviewSection() {
  return (
    <section className="platform-preview" aria-labelledby="platform-preview-title">
      <div className="platform-preview__intro">
        <p className="living-kicker"><span className="living-kicker__line" /> A CLEAR VIEW OF THE WORK</p>
        <h2 id="platform-preview-title">One place to follow<br /><em>the road ahead.</em></h2>
        <p>RoadFix brings reports, locations and status updates into a shared workflow for citizens and authorized staff.</p>
        <span className="platform-preview__disclaimer"><CircleDot aria-hidden="true" /> Illustrative interface preview · sample records, not live data</span>
      </div>
      <div className="platform-window" aria-label="Illustrative RoadFix dashboard preview">
        <div className="platform-window__bar"><span className="platform-window__brand"><span className="platform-window__brand-mark">R</span> ROADFIX / OPERATIONS</span><span className="platform-window__mode"><i /> ILLUSTRATIVE PREVIEW</span></div>
        <div className="platform-window__body">
          <div className="platform-map" aria-label="Illustrative map with sample issue markers">
            <span className="platform-map__road platform-map__road--one" /><span className="platform-map__road platform-map__road--two" /><span className="platform-map__road platform-map__road--three" />
            <span className="platform-map__district platform-map__district--one">NORTH SECTOR</span><span className="platform-map__district platform-map__district--two">CENTRAL SECTOR</span>
            <span className="platform-map__pin platform-map__pin--one"><MapPin /></span><span className="platform-map__pin platform-map__pin--two"><MapPin /></span><span className="platform-map__pin platform-map__pin--three"><MapPin /></span>
            <span className="platform-map__legend"><i /> SAMPLE ISSUE LOCATIONS</span>
          </div>
          <div className="platform-workspace">
            <div className="platform-workspace__heading"><div><span className="platform-eyebrow">FIELD OPERATIONS</span><h3>Issue overview</h3></div><span className="platform-workspace__shield"><ShieldCheck aria-hidden="true" /> STAFF VIEW</span></div>
            <div className="platform-workspace__summary"><div><span>REPORT</span><strong>Location</strong></div><div><span>TRACK</span><strong>Status</strong></div><div><span>MANAGE</span><strong>Assignment</strong></div></div>
            <div className="platform-report-list">
              {SAMPLE_REPORTS.map((report) => <article className="platform-report" key={report.ref}><span className={`platform-report__dot platform-report__dot--${report.tone}`} /><div className="platform-report__main"><strong>{report.category}</strong><span>{report.area} · {report.ref}</span></div><span className={`platform-report__status platform-report__status--${report.tone}`}>{report.status}</span></article>)}
            </div>
            <div className="platform-workspace__foot"><span>Example workflow only</span><ArrowUpRight aria-hidden="true" /></div>
          </div>
        </div>
      </div>
    </section>
  );
}
