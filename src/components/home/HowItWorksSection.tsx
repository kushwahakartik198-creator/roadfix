import { useEffect, useState } from "react";
import { ArrowDown, Check, CircleDot } from "lucide-react";
import { HeroGraphic, type MarkerId } from "@/components/home/HeroGraphic";

const JOURNEY = [
  {
    id: "damage",
    number: "01",
    label: "Road damage",
    title: "A road problem comes into view.",
    body: "A pothole can disrupt a journey and create a hazard for everyone sharing the road.",
    signal: "ISSUE IDENTIFIED",
  },
  {
    id: "report",
    number: "02",
    label: "Citizen report",
    title: "A citizen records what they see.",
    body: "The report form captures a location, description and optional photo to explain the issue.",
    signal: "REPORT SUBMITTED",
  },
  {
    id: "review",
    number: "03",
    label: "Municipal review",
    title: "The complaint reaches a review queue.",
    body: "A complaint can be checked, assigned and handled through the relevant ward process.",
    signal: "UNDER REVIEW",
  },
  {
    id: "action",
    number: "04",
    label: "Officer action",
    title: "An officer records the next step.",
    body: "Assigned staff can update a complaint as work moves forward and add a resolution note.",
    signal: "WORK IN PROGRESS",
  },
  {
    id: "resolved",
    number: "05",
    label: "Resolution",
    title: "The outcome becomes visible.",
    body: "Once work is complete, the complaint status can be updated so the reporter can track the result.",
    signal: "STATUS UPDATED",
  },
] as const;

export function HowItWorksSection() {
  const [activeId, setActiveId] = useState<(typeof JOURNEY)[number]["id"]>(JOURNEY[0].id);

  useEffect(() => {
    const nodes = document.querySelectorAll<HTMLElement>("[data-city-step]");
    if (!("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver((entries) => {
      const mostVisible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (mostVisible) setActiveId(mostVisible.target.getAttribute("data-city-step") as typeof activeId);
    }, { rootMargin: "-24% 0px -38% 0px", threshold: [0.15, 0.35, 0.6] });

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  const activeStep = JOURNEY.find((step) => step.id === activeId) ?? JOURNEY[0];
  const activeMarker: MarkerId = activeId === "damage" ? "surface" : activeId === "report" || activeId === "review" ? "location" : "route";

  return (
    <section id="city-journey" aria-labelledby="how-it-works-heading" className="city-journey">
      <header className="city-journey__heading">
        <p className="living-kicker"><span className="living-kicker__line" /> ONE REPORT / A CLEARER ROUTE</p>
        <h2 id="how-it-works-heading">From road damage<br /><em>to recorded repair.</em></h2>
        <p>This illustrative journey shows how a road complaint can move through RoadFix. It is not a live case or a claim that every report is resolved.</p>
      </header>
      <div className="city-journey__layout">
        <ol className="city-journey__steps">
          {JOURNEY.map((step, index) => (
            <li key={step.id} data-city-step={step.id} className={`city-journey__step${activeId === step.id ? " is-active" : ""}`}>
              <button
                className="city-journey__step-button"
                type="button"
                aria-pressed={activeId === step.id}
                aria-label={`Show journey stage ${step.number}: ${step.label}`}
                onClick={() => setActiveId(step.id)}
              >
                <span className="city-journey__number">{step.number}</span>
                <span className="city-journey__step-copy">
                  <span className="city-journey__label">{step.label}</span>
                  <strong>{step.title}</strong>
                  <span className="city-journey__description">{step.body}</span>
                </span>
                <span className="city-journey__step-icon" aria-hidden="true">{index < JOURNEY.findIndex((item) => item.id === activeId) ? <Check /> : <CircleDot />}</span>
              </button>
              {index < JOURNEY.length - 1 && <span className="city-journey__connector" aria-hidden="true"><ArrowDown /></span>}
            </li>
          ))}
        </ol>
        <aside className="city-journey__visual" aria-label={`City model showing ${activeStep.label.toLowerCase()}`}>
          <HeroGraphic activeMarker={activeMarker} />
          <div className="city-journey__stage" aria-live="polite">
            <span>JOURNEY STAGE / {activeStep.number}</span>
            <strong>{activeStep.signal}</strong>
          </div>
        </aside>
      </div>
    </section>
  );
}
