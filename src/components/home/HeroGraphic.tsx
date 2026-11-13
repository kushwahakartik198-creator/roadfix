import { useEffect, useId, useState } from "react";
import { Pause, Play } from "lucide-react";

const MARKERS = [
  {
    id: "surface",
    label: "Road surface",
    detail: "A clear photo and mapped location help describe a road issue.",
    x: "47%",
    y: "61%",
  },
  {
    id: "location",
    label: "Location signal",
    detail: "Location helps connect a report with the road and ward it concerns.",
    x: "69%",
    y: "39%",
  },
  {
    id: "route",
    label: "Repair route",
    detail: "A complaint can be followed as it moves through review and action.",
    x: "28%",
    y: "72%",
  },
] as const;

export type MarkerId = (typeof MARKERS)[number]["id"];

const BUILDINGS = [
  { x: 52, y: 209, w: 62, h: 100, d: 20, tone: 0 },
  { x: 137, y: 166, w: 74, h: 143, d: 22, tone: 1 },
  { x: 232, y: 203, w: 58, h: 106, d: 19, tone: 2 },
  { x: 318, y: 135, w: 78, h: 174, d: 24, tone: 1 },
  { x: 416, y: 187, w: 58, h: 122, d: 18, tone: 0 },
  { x: 494, y: 151, w: 78, h: 158, d: 22, tone: 2 },
  { x: 604, y: 208, w: 62, h: 101, d: 18, tone: 1 },
  { x: 683, y: 170, w: 75, h: 139, d: 23, tone: 0 },
  { x: 784, y: 216, w: 58, h: 93, d: 18, tone: 2 },
  { x: 94, y: 290, w: 52, h: 79, d: 18, tone: 2 },
  { x: 211, y: 276, w: 59, h: 93, d: 17, tone: 1 },
  { x: 376, y: 273, w: 64, h: 96, d: 18, tone: 0 },
  { x: 552, y: 278, w: 57, h: 91, d: 18, tone: 2 },
  { x: 715, y: 279, w: 62, h: 90, d: 17, tone: 1 },
] as const;

function Building({
  x,
  y,
  w,
  h,
  d,
  tone,
}: (typeof BUILDINGS)[number]) {
  const front = ["#15243a", "#192a40", "#101e32"][tone];
  const side = ["#0d1829", "#112035", "#0b1727"][tone];
  const roof = ["#304258", "#354a60", "#25374d"][tone];
  const rows = Math.max(2, Math.floor(h / 19));
  const columns = Math.max(2, Math.floor(w / 16));

  return (
    <g>
      <path d={`M${x} ${y} l${d} -${Math.round(d * 0.52)} h${w} l-${d} ${Math.round(d * 0.52)}z`} fill={roof} stroke="#71849b" strokeOpacity=".2" />
      <path d={`M${x + w} ${y} l${d} -${Math.round(d * 0.52)} v${h} l-${d} ${Math.round(d * 0.52)}z`} fill={side} stroke="#71849b" strokeOpacity=".14" />
      <path d={`M${x} ${y} h${w} v${h} h-${w}z`} fill={front} stroke="#71849b" strokeOpacity=".22" />
      {Array.from({ length: rows }, (_, row) =>
        Array.from({ length: columns }, (_, column) => (
          <rect
            key={`${row}-${column}`}
            x={x + 8 + column * ((w - 16) / columns)}
            y={y + 10 + row * ((h - 18) / rows)}
            width="3.5"
            height="5"
            rx=".7"
            fill={(row * 3 + column + tone) % 5 === 0 ? "#80d9ed" : "#657c96"}
            fillOpacity={(row + column) % 3 === 0 ? ".63" : ".27"}
          />
        )),
      )}
      <path d={`M${x + w + 5} ${y - 7} v${Math.min(18, h / 5)}`} stroke="#53d9f0" strokeOpacity=".6" strokeWidth="1" />
    </g>
  );
}

export function HeroGraphic({ activeMarker }: { activeMarker?: MarkerId } = {}) {
  const [active, setActive] = useState<MarkerId>("surface");
  const [manualPause, setManualPause] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const svgId = useId().replaceAll(":", "");
  const selected = MARKERS.find((marker) => marker.id === active)!;

  useEffect(() => {
    if (activeMarker) setActive(activeMarker);
  }, [activeMarker]);

  useEffect(() => {
    const updateVisibility = () => setTabHidden(document.hidden);
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  const isPaused = manualPause || tabHidden;

  return (
    <div className={`city-hero-scene${isPaused ? " is-paused" : ""}`} role="group" aria-label="Illustrative city infrastructure scene">
      <div className="city-hero-scene__topline">
        <span><i aria-hidden="true" /> ROADFIX / CITY VIEW</span>
        <span className="city-hero-scene__coordinates">AGRA · INFRASTRUCTURE MODEL</span>
      </div>
      <div className="city-hero-scene__viewport">
        <div className="city-hero-scene__haze" aria-hidden="true" />
        <svg className="city-hero-scene__art" viewBox="0 0 900 540" role="img" aria-labelledby="city-art-title city-art-desc">
          <title id="city-art-title">RoadFix illustrative city network</title>
          <desc id="city-art-desc">Layered city buildings surround glowing orange roads and cyan infrastructure signals. This is a visual model, not live municipal data.</desc>
          <defs>
            <linearGradient id={`citySky-${svgId}`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#101e32" /><stop offset="1" stopColor="#0b1220" /></linearGradient>
            <linearGradient id={`cityGround-${svgId}`} x1="0" y1="0" x2=".8" y2="1"><stop stopColor="#17253a" /><stop offset="1" stopColor="#090f1a" /></linearGradient>
            <linearGradient id={`roadSheen-${svgId}`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#344054" /><stop offset=".48" stopColor="#1a2638" /><stop offset="1" stopColor="#101a2a" /></linearGradient>
            <radialGradient id={`cityGlow-${svgId}`}><stop stopColor="#f97316" stopOpacity=".25" /><stop offset="1" stopColor="#f97316" stopOpacity="0" /></radialGradient>
            <pattern id={`cityGrid-${svgId}`} width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="skewY(-24)"><path d="M28 0H0V28" fill="none" stroke="#8ab1c5" strokeOpacity=".11" strokeWidth=".7" /></pattern>
            <filter id={`roadBlur-${svgId}`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="8" /></filter>
            <clipPath id={`cityClip-${svgId}`}><path d="M0 0h900v540H0z" /></clipPath>
          </defs>
          <g clipPath={`url(#cityClip-${svgId})`}>
            <path fill={`url(#citySky-${svgId})`} d="M0 0h900v540H0z" />
            <ellipse cx="490" cy="291" rx="330" ry="182" fill={`url(#cityGlow-${svgId})`} />
            <path d="M0 344 180 264l179 80-179 100z" fill="#122137" opacity=".56" />
            <path d="M350 344 541 258l208 94-208 104z" fill="#172840" opacity=".63" />
            {BUILDINGS.map((building, index) => <Building key={index} {...building} />)}
            <path d="M0 385 448 168l452 206-458 223z" fill={`url(#cityGround-${svgId})`} stroke="#62758a" strokeOpacity=".25" />
            <path d="M0 385 448 168l452 206-458 223z" fill={`url(#cityGrid-${svgId})`} opacity=".78" />
            <g fill="none" stroke="#030812" strokeWidth="38" strokeLinejoin="round" opacity=".8">
              <path d="M20 455 445 250l433 195" />
              <path d="M153 540 420 185" />
              <path d="M592 540 462 194" />
              <path d="M11 353 464 543" />
            </g>
            <g fill="none" stroke={`url(#roadSheen-${svgId})`} strokeWidth="30" strokeLinejoin="round">
              <path d="M20 455 445 250l433 195" />
              <path d="M153 540 420 185" />
              <path d="M592 540 462 194" />
              <path d="M11 353 464 543" />
            </g>
            <g fill="none" stroke="#fa7418" strokeWidth="13" strokeLinejoin="round" opacity=".35" filter={`url(#roadBlur-${svgId})`}>
              <path d="M20 455 445 250l433 195" />
              <path d="M153 540 420 185" />
              <path d="M592 540 462 194" />
              <path d="M11 353 464 543" />
            </g>
            <g className="city-road-lights" fill="none" stroke="#ff9a42" strokeWidth="2.3" strokeDasharray="2 21" strokeLinecap="round">
              <path d="M20 455 445 250l433 195" />
              <path d="M153 540 420 185" />
              <path d="M592 540 462 194" />
              <path d="M11 353 464 543" />
            </g>
            <g fill="none" stroke="#a6d8e8" strokeOpacity=".26" strokeWidth="1" strokeDasharray="5 9">
              <path d="M21 455 445 250l433 195" />
              <path d="M153 540 420 185" />
              <path d="M592 540 462 194" />
              <path d="M11 353 464 543" />
            </g>
            <g className="city-particle-field" fill="#b8edff">
              <g className="city-particle"><circle cx="104" cy="116" r="1.4" /></g><g className="city-particle"><circle cx="762" cy="92" r="1" /></g><g className="city-particle"><circle cx="828" cy="240" r="1.5" /></g>
              <g className="city-particle"><circle cx="264" cy="94" r="1" /></g><g className="city-particle"><circle cx="674" cy="134" r="1.2" /></g><g className="city-particle"><circle cx="354" cy="60" r=".9" /></g>
            </g>
            <g fill="none" stroke="#65e5f7" strokeWidth="1" opacity=".7">
              <path d="M471 209v-28h48v28M506 181v-18h25v18" />
              <path d="M497 179v-49h40v49M516 130v-16h20v16" />
              <circle cx="520" cy="179" r="3" fill="#65e5f7" />
              <path d="M520 121v-17m-8 8h16" />
            </g>
            <path d="M0 500h900v40H0z" fill="#090f1a" opacity=".7" />
          </g>
        </svg>
        {MARKERS.map((marker) => (
          <button
            key={marker.id}
            type="button"
            className={`city-marker${active === marker.id ? " is-active" : ""}`}
            style={{ left: marker.x, top: marker.y }}
            aria-label={`Show ${marker.label.toLowerCase()} information`}
            aria-pressed={active === marker.id}
            onClick={() => setActive(marker.id)}
          >
            <span className="city-marker__pulse" aria-hidden="true" />
            <span className="city-marker__core" aria-hidden="true">{marker.id === "surface" ? "!" : marker.id === "location" ? "⌖" : "↗"}</span>
          </button>
        ))}
        <div className="city-hero-scene__readout" aria-live="polite">
          <span className="city-hero-scene__readout-tag">INFRASTRUCTURE SIGNAL</span>
          <strong>{selected.label}</strong>
          <p>{selected.detail}</p>
        </div>
        <div className="city-hero-scene__axis city-hero-scene__axis--left" aria-hidden="true">ROAD / 04</div>
        <div className="city-hero-scene__axis city-hero-scene__axis--right" aria-hidden="true">NETWORK / ACTIVE</div>
      </div>
      <div className="city-hero-scene__footer">
        <span>ILLUSTRATIVE CITY MODEL · NO LIVE REPORTS</span>
        <div className="city-hero-scene__controls">
          <span>SELECT A SIGNAL TO INSPECT</span>
          <button className="city-scene-motion-toggle" type="button" aria-label={manualPause ? "Resume city animation" : "Pause city animation"} aria-pressed={manualPause} onClick={() => setManualPause((paused) => !paused)}>
            {manualPause ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
          </button>
        </div>
      </div>
    </div>
  );
}
