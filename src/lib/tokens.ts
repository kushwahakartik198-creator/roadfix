/**
 * RoadFix Design System V1.0 - Tokens & Theme Specifications
 * Single source of truth for color values and WCAG AA contrast verification.
 */

export const brandTokens = {
  // Midnight Navy: App background, header, primary dark surfaces
  midnightNavy: "#0B1220",
  // Deep Slate: Cards, panels, secondary surfaces
  deepSlate: "#111C2E",
  // Surface Elevated: Elevated panels, popovers, dropdowns
  surfaceElevated: "#182438",

  // Road Orange: Signature brand color, primary interactive CTAs
  roadOrange: "#F97316",
  primary: "#F97316",
  primaryForeground: "#0B1220",

  // Signal Amber: Warning/priority and secondary highlight
  signalAmber: "#FBBF24",

  // Cloud White: High-contrast foreground text
  cloudWhite: "#F8FAFC",
  // Slate Grey: Muted text, secondary labels, placeholders
  slateGrey: "#94A3B8",

  // Decorative border for cards and dividers
  border: "#263449",
  // Stronger input border meeting 3:1 graphical boundary contrast against navy & deep slate
  inputBorder: "#5B6B84",
  // Active focus ring
  ring: "#F97316",

  // Semantic Status Tokens
  success: "#22C55E",
  successForeground: "#0B1220",
  warning: "#F59E0B",
  warningForeground: "#0B1220",
  error: "#EF4444",
  errorForeground: "#0B1220",
  info: "#38BDF8",
  infoForeground: "#0B1220",

  // Radii Scale
  radiusBase: "0.625rem", // 10px

  // Shadows
  shadowGlow: "0 0 20px -3px rgba(249, 115, 22, 0.25)",
} as const;

export type BrandTokens = typeof brandTokens;
