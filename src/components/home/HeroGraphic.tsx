export function HeroGraphic() {
  return (
    <div className="relative w-full max-w-[500px] select-none mx-auto">
      {/* Decorative ambient radial backdrop */}
      <div
        className="absolute inset-0 bg-primary/10 blur-3xl rounded-full -z-10 pointer-events-none transform-gpu animate-ambient-glow"
        aria-hidden="true"
      />

      <svg
        viewBox="0 0 540 460"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto overflow-visible drop-shadow-xl"
        aria-hidden="true"
        focusable="false"
        role="presentation"
      >
        <defs>
          {/* Radial ambient glow */}
          <radialGradient id="heroOrangeAmbient" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
            <stop offset="0%" stopColor="#F97316" stopOpacity="0.3" />
            <stop offset="70%" stopColor="#F97316" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#F97316" stopOpacity="0" />
          </radialGradient>

          {/* Road gradient */}
          <linearGradient id="roadOrangeGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#F59E0B" />
            <stop offset="50%" stopColor="#F97316" />
            <stop offset="100%" stopColor="#FBBF24" />
          </linearGradient>

          {/* Surface panel gradient */}
          <linearGradient id="panelDarkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#182438" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#111C2E" stopOpacity="0.9" />
          </linearGradient>
        </defs>

        {/* Ambient atmospheric glow layer */}
        <ellipse
          cx="270"
          cy="230"
          rx="180"
          ry="130"
          fill="url(#heroOrangeAmbient)"
          className="animate-ambient-glow"
        />

        {/* Layered dark foundation surface panels */}
        <rect
          x="30"
          y="40"
          width="480"
          height="380"
          rx="16"
          fill="url(#panelDarkGrad)"
          stroke="#263449"
          strokeWidth="1"
        />

        {/* Geospatial coordinate grid lines (abstract) */}
        <g stroke="#263449" strokeWidth="1" strokeOpacity="0.35">
          <line x1="70" y1="40" x2="70" y2="420" />
          <line x1="150" y1="40" x2="150" y2="420" />
          <line x1="230" y1="40" x2="230" y2="420" />
          <line x1="310" y1="40" x2="310" y2="420" />
          <line x1="390" y1="40" x2="390" y2="420" />
          <line x1="470" y1="40" x2="470" y2="420" />

          <line x1="30" y1="100" x2="510" y2="100" />
          <line x1="30" y1="160" x2="510" y2="160" />
          <line x1="30" y1="220" x2="510" y2="220" />
          <line x1="30" y1="280" x2="510" y2="280" />
          <line x1="30" y1="340" x2="510" y2="340" />
        </g>

        {/* Secondary interconnected transit lines */}
        <g stroke="#334155" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.6">
          <path d="M 70 340 L 150 280 L 150 160 L 230 100" />
          <path d="M 150 280 L 310 280 L 390 340 L 470 340" />
          <path d="M 230 100 L 390 100 L 470 160" />
          <path d="M 310 220 L 310 160 L 390 100" strokeDasharray="4 4" />
          <path d="M 70 160 L 150 160 L 230 220" strokeDasharray="4 4" />
        </g>

        {/* Abstract infrastructure junction nodes */}
        <g>
          <circle cx="150" cy="280" r="4" fill="#38BDF8" fillOpacity="0.8" />
          <circle cx="150" cy="160" r="4" fill="#38BDF8" fillOpacity="0.8" />
          <circle cx="230" cy="100" r="4" fill="#38BDF8" fillOpacity="0.8" />
          <circle cx="390" cy="100" r="4" fill="#38BDF8" fillOpacity="0.8" />
          <circle cx="390" cy="340" r="4" fill="#38BDF8" fillOpacity="0.8" />
          <circle cx="310" cy="280" r="4" fill="#38BDF8" fillOpacity="0.8" />
        </g>

        {/* Primary Highway Arterial: Road Orange Glowing Path */}
        {/* Soft bloom layer */}
        <path
          d="M 50 380 C 130 350, 180 280, 270 230 S 390 170, 480 80"
          fill="none"
          stroke="#F97316"
          strokeWidth="8"
          strokeLinecap="round"
          strokeOpacity="0.25"
        />
        {/* Crisp core arterial path with one-time stroke-dashoffset reveal */}
        <path
          d="M 50 380 C 130 350, 180 280, 270 230 S 390 170, 480 80"
          fill="none"
          stroke="url(#roadOrangeGrad)"
          strokeWidth="3.5"
          strokeLinecap="round"
          className="animate-draw-road"
        />

        {/* Pulse rings at key strategic arterial junctions */}
        <g>
          <circle
            cx="270"
            cy="230"
            r="14"
            stroke="#F97316"
            strokeOpacity="0.25"
            strokeWidth="1.5"
          />
          <circle cx="270" cy="230" r="7" fill="#F97316" />
          <circle cx="270" cy="230" r="3" fill="#0B1220" />

          <circle cx="160" cy="295" r="10" stroke="#FBBF24" strokeOpacity="0.3" strokeWidth="1.5" />
          <circle cx="160" cy="295" r="5" fill="#FBBF24" />

          <circle cx="400" cy="140" r="10" stroke="#F97316" strokeOpacity="0.3" strokeWidth="1.5" />
          <circle cx="400" cy="140" r="5" fill="#F97316" />
        </g>

        {/* Abstract geometric location pin markers (no text, no numbers, purely decorative) */}
        {/* Marker 1: Central intersection */}
        <g transform="translate(258, 188)">
          <path
            d="M 12 0 C 5.37 0 0 5.37 0 12 C 0 19.5 12 30 12 30 C 12 30 24 19.5 24 12 C 24 5.37 18.63 0 12 0 Z"
            fill="#F97316"
          />
          <circle cx="12" cy="11" r="4.5" fill="#0B1220" />
        </g>

        {/* Marker 2: Secondary western node */}
        <g transform="translate(148, 253)">
          <path
            d="M 10 0 C 4.48 0 0 4.48 0 10 C 0 16.25 10 25 10 25 C 10 25 20 16.25 20 10 C 20 4.48 15.52 0 10 0 Z"
            fill="#FBBF24"
          />
          <circle cx="10" cy="9.5" r="3.5" fill="#0B1220" />
        </g>

        {/* Marker 3: North-eastern arterial node */}
        <g transform="translate(390, 98)">
          <path
            d="M 10 0 C 4.48 0 0 4.48 0 10 C 0 16.25 10 25 10 25 C 10 25 20 16.25 20 10 C 20 4.48 15.52 0 10 0 Z"
            fill="#38BDF8"
          />
          <circle cx="10" cy="9.5" r="3.5" fill="#0B1220" />
        </g>
      </svg>
    </div>
  );
}
