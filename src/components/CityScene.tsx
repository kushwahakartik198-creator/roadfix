import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

export function CityScene() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hintRef = useRef<HTMLDivElement | null>(null);
  const [step, setStep] = useState<0 | 1 | 2>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMedia = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduce = reduceMedia.matches;
    const handleReduceChange = (e: MediaQueryListEvent) => {
      reduce = e.matches;
    };
    reduceMedia.addEventListener("change", handleReduceChange);

    let animId = 0;
    let W = window.innerWidth;
    let H = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let vy = H * 0.5;
    let far: HTMLCanvasElement;
    let mid: HTMLCanvasElement;
    let stars: [number, number, number, number][] = [];
    let pj: number[] = [];
    let ps = 0;
    let mx = 0;
    let tx = 0;
    let last = -1;

    const R = (s: number) => () => {
      s |= 0;
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const ss = (a: number, b: number, v: number) => {
      v = Math.min(1, Math.max(0, (v - a) / (b - a)));
      return v * v * (3 - 2 * v);
    };

    const clamp = (val: number, min: number, max: number) =>
      Math.min(max, Math.max(min, val));

    /* Layer 1 and 2: drawn once into offscreen canvases, then parallaxed every frame */
    function layer(
      seed: number,
      minW: number,
      maxW: number,
      minH: number,
      maxH: number,
      col: string,
      lit: number,
      dome: boolean
    ): HTMLCanvasElement {
      const r = R(seed);
      const o = document.createElement("canvas");
      o.width = W * 1.2 * dpr;
      o.height = H * dpr;
      const g = o.getContext("2d");
      if (!g) return o;
      g.scale(dpr, dpr);
      const base = vy + H * 0.06;
      for (let b = 0; b < W * 1.2; ) {
        const w = minW + r() * (maxW - minW);
        const h = H * (minH + r() * (maxH - minH));
        g.fillStyle = col;
        g.fillRect(b, base - h, w, h + H);
        if (lit) {
          for (let wy = base - h + 10; wy < base - 8; wy += 16) {
            for (let wx = b + 6; wx < b + w - 8; wx += 12) {
              if (r() < lit) {
                g.fillStyle = r() < 0.2 ? "#F97316" : "#FBBF24";
                g.globalAlpha = 0.35 + r() * 0.5;
                g.fillRect(wx, wy, 5, 7);
                g.globalAlpha = 1;
              }
            }
          }
        }
        b += w + r() * 6;
      }
      if (dome) {
        const dx = W * 0.74;
        const by = base - H * 0.2;
        g.fillStyle = col;
        g.beginPath();
        g.arc(dx, by - 30, 44, Math.PI, 0);
        g.fill();
        g.fillRect(dx - 60, by - 30, 120, H);
        g.fillRect(dx - 3, by - 100, 6, 30);
        g.beginPath();
        g.arc(dx, by - 104, 5, 0, 7);
        g.fill();
        [-92, 92].forEach((m) => {
          g.fillRect(dx + m - 5, by - 90, 10, H);
          g.beginPath();
          g.arc(dx + m, by - 90, 8, Math.PI, 0);
          g.fill();
        });
      }
      return o;
    }

    function size() {
      if (!canvas) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      vy = H * 0.5;
      far = layer(7, 30, 70, 0.05, 0.16, "#18263d", 0, true);
      mid = layer(21, 60, 130, 0.06, 0.26, "#0e182a", 0.28, false);
      const r = R(3);
      stars = Array.from({ length: 70 }, () => [
        r() * W,
        r() * vy * 0.8,
        r() * 1.4 + 0.4,
        r() * 6,
      ]);
      const q = R(5);
      pj = Array.from({ length: 16 }, () => 0.8 + q() * 0.4);
    }

    function frame(t: number) {
      if (!ctx) return;
      const T = reduce ? 0 : t / 1e3;
      let p = 0;
      if (sectionRef.current) {
        const rect = sectionRef.current.getBoundingClientRect();
        const maxScroll = rect.height - window.innerHeight;
        p = maxScroll > 0 ? clamp(-rect.top / maxScroll, 0, 1) : 0;
      }

      ps += (p - ps) * 0.08;
      mx += (tx - mx) * 0.05;
      const vx = W / 2 + mx * 30;
      const gy = vy + H * 0.04;
      const HW = W * 0.55;
      const q = ss(0, 0.34, ps);
      const pin = ss(0.36, 0.46, ps);
      const fix = ss(0.68, 0.8, ps);
      const P = (d: number) => 1 / (1 + d * 0.6);
      const Y = (u: number) => gy + (H - gy) * u;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      /* sky + horizon glow that warms as the repair completes */
      let g = ctx.createLinearGradient(0, 0, 0, gy);
      g.addColorStop(0, "#0B1220");
      g.addColorStop(0.75, "#17263f");
      g.addColorStop(1, "#5a2c12");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      g = ctx.createRadialGradient(vx, gy, 0, vx, gy, W * 0.7);
      g.addColorStop(0, `rgba(249,115,22,${0.12 + 0.4 * ps})`);
      g.addColorStop(1, "rgba(249,115,22,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#F8FAFC";
      stars.forEach((s) => {
        ctx.globalAlpha = (0.45 + 0.35 * Math.sin(T + s[3])) * (1 - ps * 0.7);
        ctx.fillRect(s[0], s[1], s[2], s[2]);
      });
      ctx.globalAlpha = 1;

      /* layers 1 and 2: each scales and shifts at its own speed */
      const L = (o: HTMLCanvasElement, k: number, sh: number) => {
        ctx.save();
        ctx.translate(vx, gy);
        const s = 1 + ps * k;
        ctx.scale(s, s);
        ctx.translate(-vx, -gy);
        ctx.drawImage(o, -W * 0.1 + mx * sh, 0, W * 1.2, H);
        ctx.restore();
      };
      L(far, 0.05, -8);
      L(mid, 0.3, -22);

      /* layer 3: road, lane dashes, lamps, pothole */
      ctx.fillStyle = "#0b1321";
      ctx.fillRect(0, gy, W, H);
      g = ctx.createLinearGradient(0, gy, 0, H);
      g.addColorStop(0, "#101a2b");
      g.addColorStop(1, "#1a2940");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(vx, gy);
      ctx.lineTo(vx + HW, H);
      ctx.lineTo(vx - HW, H);
      ctx.fill();
      ctx.strokeStyle = "rgba(248,250,252,.22)";
      ctx.lineWidth = 2;
      [-1, 1].forEach((s) => {
        ctx.beginPath();
        ctx.moveTo(vx, gy);
        ctx.lineTo(vx + s * HW * 0.94, H);
        ctx.stroke();
      });

      const O = 25.2 * q;
      ctx.fillStyle = "#FBBF24";
      for (let k = 0; k < 16; k++) {
        const d = (((k * 2 - O) % 32) + 32) % 32;
        const a = P(d);
        const b = P(d + 0.9);
        const w = a * HW * 0.02;
        const w2 = b * HW * 0.02;
        ctx.beginPath();
        ctx.moveTo(vx - w2, Y(b));
        ctx.lineTo(vx + w2, Y(b));
        ctx.lineTo(vx + w, Y(a));
        ctx.lineTo(vx - w, Y(a));
        ctx.fill();
      }
      const lamps: number[] = [];
      for (let k = 0; k < 6; k++) lamps.push((((k * 7 - O) % 42) + 42) % 42);
      lamps
        .sort((a, b) => b - a)
        .forEach((d, k) => {
          const u = P(d);
          const y = Y(u);
          const ph = u * H * 0.5;
          [-1, 1].forEach((s) => {
            const px = vx + s * u * HW * 1.14;
            const hx = px - s * u * HW * 0.1;
            ctx.strokeStyle = "#223250";
            ctx.lineWidth = Math.max(1, u * 8);
            ctx.beginPath();
            ctx.moveTo(px, y);
            ctx.lineTo(px, y - ph);
            ctx.lineTo(hx, y - ph - u * H * 0.01);
            ctx.stroke();
            const r = u * H * 0.3;
            const gl = ctx.createRadialGradient(hx, y - ph, 0, hx, y - ph, r);
            gl.addColorStop(0, `rgba(251,191,36,${0.55 + 0.2 * Math.sin(T * 2 + k)})`);
            gl.addColorStop(1, "rgba(251,191,36,0)");
            ctx.fillStyle = gl;
            ctx.fillRect(hx - r, y - ph - r, 2 * r, 2 * r);
          });
        });

      /* the pothole: approaches, gets pinned, gets patched */
      const dp = 26 - O;
      const u = P(dp);
      const cx = vx + u * HW * 0.34;
      const cy = Y(u);
      const rx = u * HW * 0.22;
      const ry = rx * 0.32;
      const poly = (k: number) => {
        ctx.beginPath();
        pj.forEach((j, i) => {
          const a = (i / pj.length) * 6.283;
          ctx[i ? "lineTo" : "moveTo"](
            cx + Math.cos(a) * rx * j * k,
            cy + Math.sin(a) * ry * j * k
          );
        });
        ctx.closePath();
      };
      poly(1.18);
      ctx.fillStyle = "#0a111d";
      ctx.fill();
      poly(1);
      ctx.fillStyle = "#04070d";
      ctx.fill();
      if (fix) {
        ctx.globalAlpha = fix;
        poly(1.25);
        ctx.fillStyle = "#2b3a56";
        ctx.fill();
        ctx.strokeStyle = "#FBBF24";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (pin) {
        const col = fix > 0.5 ? "#22C55E" : "#F97316";
        const pr = rx * 0.36;
        const tip =
          cy -
          (1 - pin) * rx -
          (fix > 0.5 ? 0 : Math.abs(Math.sin(T * 3)) * rx * 0.1);
        const pu = (T * 0.7) % 1;
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.globalAlpha = pin * (1 - pu);
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx * (1.2 + pu), ry * (1.2 + pu), 0, 0, 6.283);
        ctx.stroke();
        ctx.globalAlpha = pin * (1 - fix);
        ctx.fillStyle = "#F97316";
        const kx = cx + rx * 1.5;
        const ky = cy + ry * 0.4;
        ctx.beginPath();
        ctx.moveTo(kx - rx * 0.22, ky);
        ctx.lineTo(kx + rx * 0.22, ky);
        ctx.lineTo(kx, ky - rx * 0.6);
        ctx.fill();
        ctx.fillStyle = "#F8FAFC";
        ctx.fillRect(kx - rx * 0.1, ky - rx * 0.28, rx * 0.2, rx * 0.08);
        ctx.globalAlpha = pin;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(cx, tip - pr * 1.9, pr, 0, 6.283);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx - pr * 0.85, tip - pr * 1.4);
        ctx.lineTo(cx + pr * 0.85, tip - pr * 1.4);
        ctx.lineTo(cx, tip);
        ctx.fill();
        ctx.fillStyle = "#F8FAFC";
        ctx.beginPath();
        ctx.arc(cx, tip - pr * 1.9, pr * 0.38, 0, 6.283);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      /* words follow the story */
      const i: 0 | 1 | 2 = ps < 0.34 ? 0 : ps < 0.68 ? 1 : 2;
      if (i !== last) {
        last = i;
        setStep(i);
      }
      if (hintRef.current) {
        hintRef.current.style.opacity = p > 0.03 ? "0" : "1";
      }
      animId = requestAnimationFrame(frame);
    }

    const handleResize = () => {
      size();
    };
    const handlePointerMove = (e: PointerEvent) => {
      tx = (e.clientX / W - 0.5) * 2;
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("pointermove", handlePointerMove);
    size();
    animId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("pointermove", handlePointerMove);
      reduceMedia.removeEventListener("change", handleReduceChange);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="city-scene-section relative w-full"
      style={{ height: "450vh" }}
      aria-label="Agra night street interactive city scene"
    >
      <div
        className="sticky top-0 w-full overflow-hidden"
        style={{ height: "100vh" }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full block"
          role="img"
          aria-label="Night street in Agra: a pothole is spotted, reported with a map pin, then repaired"
        />

        <div className="city-copy">
          <section className={`city-caption ${step === 0 ? "on" : ""}`}>
            <h1>Agra’s potholes, on the record.</h1>
            <p>
              Snap a photo, drop a pin, and follow the repair until the road is
              whole again.
            </p>
          </section>

          <section className={`city-caption ${step === 1 ? "on" : ""}`}>
            <h2>Reported in seconds.</h2>
            <p>
              Your photo and GPS pin reach the officer who owns that road.
            </p>
          </section>

          <section className={`city-caption ${step === 2 ? "on" : ""}`}>
            <h2>Fixed, and you can see it.</h2>
            <p>Every repair stays public until the patch is down.</p>
            <Link to="/report" className="city-btn">
              Report a pothole
            </Link>
          </section>
        </div>

        <div className="city-chip" data-s={step} aria-live="polite">
          <span className="city-dot" />
          <span>{step === 0 ? "Spotted" : step === 1 ? "Reported" : "Fixed"}</span>
        </div>

        <div ref={hintRef} className="city-hint">
          Scroll to drive down the road
        </div>
      </div>

      <style>{`
        .city-scene-section {
          --bg: #0B1220;
          --card: #111C2E;
          --orange: #F97316;
          --amber: #FBBF24;
          --text: #F8FAFC;
          --muted: #94A3B8;
          --line: #263449;
          --ok: #22C55E;
          color: var(--text);
          font-family: 'Barlow', system-ui, sans-serif;
        }
        .city-scene-section .city-copy {
          position: absolute;
          z-index: 2;
          left: 6vw;
          top: calc(17vh + env(safe-area-inset-top, 0px));
          width: min(32rem, 88vw);
          height: 17rem;
        }
        .city-scene-section .city-caption {
          position: absolute;
          left: 0;
          top: 0;
          opacity: 0;
          visibility: hidden;
          transform: translateY(12px);
          transition: opacity 0.6s, transform 0.6s, visibility 0s 0.6s;
          pointer-events: none;
        }
        .city-scene-section .city-caption.on {
          opacity: 1;
          visibility: visible;
          transform: none;
          transition-delay: 0s;
          pointer-events: auto;
        }
        .city-scene-section h1,
        .city-scene-section h2 {
          font-family: 'Barlow Condensed', 'Arial Narrow', sans-serif;
          font-weight: 700;
          font-size: clamp(2.8rem, 7.5vw, 5.8rem);
          line-height: 0.92;
          letter-spacing: -0.01em;
          margin-bottom: 16px;
          color: var(--text);
        }
        .city-scene-section .city-caption p {
          color: #cbd5e1;
          max-width: 26rem;
          font-size: 18px;
          line-height: 1.5;
        }
        .city-scene-section .city-btn {
          margin-top: 22px;
          padding: 13px 26px;
          background: var(--orange);
          color: var(--bg);
          border: 0;
          border-radius: 6px;
          font-family: 'Barlow Condensed', 'Arial Narrow', sans-serif;
          font-weight: 700;
          font-size: 19px;
          cursor: pointer;
          display: inline-block;
          text-decoration: none;
          transition: background 0.2s;
        }
        .city-scene-section .city-btn:hover {
          background: var(--amber);
        }
        .city-scene-section .city-btn:focus-visible {
          outline: 3px solid var(--amber);
          outline-offset: 3px;
        }
        .city-scene-section .city-chip {
          position: absolute;
          z-index: 2;
          left: 6vw;
          bottom: calc(24px + env(safe-area-inset-bottom, 0px));
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 18px;
          background: rgba(17, 28, 46, 0.88);
          border: 1px solid var(--line);
          border-radius: 999px;
          font-weight: 500;
          font-size: 15px;
          color: var(--text);
          backdrop-filter: blur(4px);
        }
        .city-scene-section .city-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: var(--amber);
          transition: background 0.4s;
        }
        .city-scene-section .city-chip[data-s="1"] .city-dot {
          background: var(--orange);
        }
        .city-scene-section .city-chip[data-s="2"] .city-dot {
          background: var(--ok);
        }
        .city-scene-section .city-hint {
          position: absolute;
          z-index: 2;
          right: 6vw;
          bottom: calc(30px + env(safe-area-inset-bottom, 0px));
          color: var(--muted);
          font-size: 15px;
          transition: opacity 0.4s;
        }
      `}</style>
    </section>
  );
}
