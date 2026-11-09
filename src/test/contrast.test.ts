import { describe, it, expect } from "vitest";
import { brandTokens } from "@/lib/tokens";
import fs from "fs";
import path from "path";

/**
 * Calculates relative luminance according to WCAG 2.1 specifications.
 * https://www.w3.org/WAI/GL/wiki/Relative_luminance
 */
export function getRelativeLuminance(hex: string): number {
  const sanitized = hex.replace("#", "").trim();
  const r = parseInt(sanitized.substring(0, 2), 16) / 255;
  const g = parseInt(sanitized.substring(2, 4), 16) / 255;
  const b = parseInt(sanitized.substring(4, 6), 16) / 255;

  const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Calculates WCAG 2.1 contrast ratio between two hex colors.
 * Returns ratio as a number >= 1.0 (e.g. 4.5, 7.1).
 */
export function getContrastRatio(hex1: string, hex2: string): number {
  const l1 = getRelativeLuminance(hex1);
  const l2 = getRelativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("WCAG 2.1 AA Contrast Ratios Verification", () => {
  it("verifies Cloud White foreground against Midnight Navy background (AA normal >= 4.5:1)", () => {
    const ratio = getContrastRatio(brandTokens.cloudWhite, brandTokens.midnightNavy);
    // 17.89:1
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("verifies Cloud White foreground against Deep Slate card (AA normal >= 4.5:1)", () => {
    const ratio = getContrastRatio(brandTokens.cloudWhite, brandTokens.deepSlate);
    // 16.33:1
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("verifies dark navy primary foreground on Road Orange button (AA normal >= 4.5:1, do not use white)", () => {
    const ratioNavyOnOrange = getContrastRatio(
      brandTokens.primaryForeground,
      brandTokens.roadOrange
    );
    // 6.68:1
    expect(ratioNavyOnOrange).toBeGreaterThanOrEqual(4.5);

    // Verify white on orange fails the 4.5:1 threshold (proving why dark navy foreground is mandatory)
    const ratioWhiteOnOrange = getContrastRatio(brandTokens.cloudWhite, brandTokens.roadOrange);
    expect(ratioWhiteOnOrange).toBeLessThan(4.5);
  });

  it("verifies Slate Grey muted text against Midnight Navy and Deep Slate (AA normal >= 4.5:1)", () => {
    const ratioOnNavy = getContrastRatio(brandTokens.slateGrey, brandTokens.midnightNavy);
    const ratioOnSlate = getContrastRatio(brandTokens.slateGrey, brandTokens.deepSlate);
    // 7.30:1 and 6.66:1
    expect(ratioOnNavy).toBeGreaterThanOrEqual(4.5);
    expect(ratioOnSlate).toBeGreaterThanOrEqual(4.5);
  });

  it("verifies input border meets WCAG AA UI component boundary threshold (>= 3:1) against surfaces", () => {
    const ratioOnNavy = getContrastRatio(brandTokens.inputBorder, brandTokens.midnightNavy);
    const ratioOnSlate = getContrastRatio(brandTokens.inputBorder, brandTokens.deepSlate);
    // 3.46:1 and 3.16:1
    expect(ratioOnNavy).toBeGreaterThanOrEqual(3.0);
    expect(ratioOnSlate).toBeGreaterThanOrEqual(3.0);
  });

  it("verifies focus ring meets focus indicator threshold (>= 3:1) against Midnight Navy background", () => {
    const ratio = getContrastRatio(brandTokens.ring, brandTokens.midnightNavy);
    // 6.68:1
    expect(ratio).toBeGreaterThanOrEqual(3.0);
  });

  it("verifies status colors as text against Midnight Navy background (AA normal >= 4.5:1)", () => {
    expect(getContrastRatio(brandTokens.success, brandTokens.midnightNavy)).toBeGreaterThanOrEqual(
      4.5
    );
    expect(getContrastRatio(brandTokens.warning, brandTokens.midnightNavy)).toBeGreaterThanOrEqual(
      4.5
    );
    expect(getContrastRatio(brandTokens.error, brandTokens.midnightNavy)).toBeGreaterThanOrEqual(
      4.5
    );
    expect(getContrastRatio(brandTokens.info, brandTokens.midnightNavy)).toBeGreaterThanOrEqual(
      4.5
    );
  });

  it("verifies status colors as text against Deep Slate card (AA normal >= 4.5:1)", () => {
    expect(getContrastRatio(brandTokens.success, brandTokens.deepSlate)).toBeGreaterThanOrEqual(
      4.5
    );
    expect(getContrastRatio(brandTokens.warning, brandTokens.deepSlate)).toBeGreaterThanOrEqual(
      4.5
    );
    expect(getContrastRatio(brandTokens.error, brandTokens.deepSlate)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(brandTokens.info, brandTokens.deepSlate)).toBeGreaterThanOrEqual(4.5);
  });

  it("verifies solid badge foreground text on each status color fill (AA normal >= 4.5:1)", () => {
    expect(
      getContrastRatio(brandTokens.successForeground, brandTokens.success)
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      getContrastRatio(brandTokens.warningForeground, brandTokens.warning)
    ).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(brandTokens.errorForeground, brandTokens.error)).toBeGreaterThanOrEqual(
      4.5
    );
    expect(getContrastRatio(brandTokens.infoForeground, brandTokens.info)).toBeGreaterThanOrEqual(
      4.5
    );
  });

  it("ensures token map remains in sync with src/index.css variable definitions", () => {
    const cssPath = path.resolve(__dirname, "../index.css");
    const cssContent = fs.readFileSync(cssPath, "utf-8").toLowerCase();

    // Verify key color values are defined in CSS
    expect(cssContent).toContain(brandTokens.midnightNavy.toLowerCase());
    expect(cssContent).toContain(brandTokens.deepSlate.toLowerCase());
    expect(cssContent).toContain(brandTokens.roadOrange.toLowerCase());
    expect(cssContent).toContain(brandTokens.cloudWhite.toLowerCase());
    expect(cssContent).toContain(brandTokens.slateGrey.toLowerCase());
    expect(cssContent).toContain(brandTokens.border.toLowerCase());
    expect(cssContent).toContain(brandTokens.inputBorder.toLowerCase());
    expect(cssContent).toContain(brandTokens.success.toLowerCase());
    expect(cssContent).toContain(brandTokens.warning.toLowerCase());
    expect(cssContent).toContain(brandTokens.error.toLowerCase());
    expect(cssContent).toContain(brandTokens.info.toLowerCase());
  });
});
