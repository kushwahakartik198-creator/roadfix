export function AgraSchematic() {
  return (
    <div className="w-full max-w-[480px] select-none mx-auto">
      <svg
        viewBox="0 0 460 320"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto overflow-visible rounded-xl border border-border bg-card/60 p-4 drop-shadow-md"
        aria-hidden="true"
        focusable="false"
        role="presentation"
      >
        <defs>
          <radialGradient id="schematicHubGlow" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
            <stop offset="0%" stopColor="#F97316" stopOpacity="0.25" />
            <stop offset="70%" stopColor="#F97316" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#F97316" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Ambient background hub glow */}
        <circle cx="230" cy="160" r="110" fill="url(#schematicHubGlow)" />

        {/* Concentric urban boundary & corridor rings */}
        <circle
          cx="230"
          cy="160"
          r="120"
          stroke="#263449"
          strokeWidth="1"
          strokeDasharray="4 4"
          strokeOpacity="0.6"
        />
        <circle cx="230" cy="160" r="80" stroke="#263449" strokeWidth="1.5" strokeOpacity="0.8" />
        <circle cx="230" cy="160" r="40" stroke="#334155" strokeWidth="1.5" strokeOpacity="0.7" />

        {/* Radial structural corridor axes */}
        <g stroke="#334155" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.5">
          <line x1="50" y1="160" x2="410" y2="160" />
          <line x1="230" y1="40" x2="230" y2="280" />
          <line x1="102" y1="75" x2="358" y2="245" strokeDasharray="3 3" />
          <line x1="102" y1="245" x2="358" y2="75" strokeDasharray="3 3" />
        </g>

        {/* Abstract interconnected arterial sector links */}
        <path
          d="M 150 160 Q 180 110, 230 120 T 310 160"
          fill="none"
          stroke="#F97316"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeOpacity="0.85"
        />
        <path
          d="M 150 160 Q 180 210, 230 200 T 310 160"
          fill="none"
          stroke="#FBBF24"
          strokeWidth="2"
          strokeLinecap="round"
          strokeOpacity="0.75"
        />
        <path
          d="M 230 120 L 230 80 Q 280 60, 310 100"
          fill="none"
          stroke="#38BDF8"
          strokeWidth="1.5"
          strokeDasharray="4 4"
          strokeOpacity="0.6"
        />

        {/* Primary Central Infrastructure Nexus */}
        <circle cx="230" cy="160" r="16" stroke="#F97316" strokeWidth="1.5" strokeOpacity="0.3" />
        <circle cx="230" cy="160" r="8" fill="#F97316" />
        <circle cx="230" cy="160" r="3" fill="#0B1220" />

        {/* Peripheral node points */}
        <g>
          <circle cx="150" cy="160" r="4.5" fill="#FBBF24" />
          <circle cx="310" cy="160" r="4.5" fill="#F97316" />
          <circle cx="230" cy="80" r="4" fill="#38BDF8" />
          <circle cx="230" cy="240" r="4" fill="#38BDF8" />
          <circle cx="110" cy="115" r="3.5" fill="#94A3B8" />
          <circle cx="350" cy="205" r="3.5" fill="#94A3B8" />
        </g>
      </svg>
    </div>
  );
}
