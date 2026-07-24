"use strict";
// Auto-contrast — ported verbatim from kpi-cards.jsx (luminance / inkToneFor + ink ramps).

export type InkTone = "light" | "dark";
export type InkMode = "auto" | "light" | "dark";

/** Parse a CSS color to [r,g,b] 0..255, or null if the format is unrecognised.
 *  Handles #rgb / #rgba / #rrggbb / #rrggbbaa and rgb()/rgba() (incl. percentage channels). */
function parseRgb(color: string): [number, number, number] | null {
  if (!color) return null;
  const c = color.trim().toLowerCase();
  if (c[0] === "#") {
    let h = c.slice(1);
    if (h.length === 3 || h.length === 4) h = h.split("").map(ch => ch + ch).join(""); // #rgb(a) → #rrggbb(aa)
    if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(h)) return null; // reject malformed hex (parseInt would truncate at a bad char)
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; // alpha (if any) ignored
  }
  const m = c.match(/^rgba?\(([^)]+)\)/);
  if (m) {
    const clamp = (n: number) => Math.min(255, Math.max(0, n));
    const num = (s: string) => clamp(s.trim().endsWith("%") ? parseFloat(s) * 2.55 : parseFloat(s)); // clamp() keeps NaN as NaN
    const parts = m[1].split(/[,\s/]+/).filter(Boolean);
    if (parts.length >= 3) {
      const r = num(parts[0]), g = num(parts[1]), b = num(parts[2]);
      if (isFinite(r) && isFinite(g) && isFinite(b)) return [r, g, b];
    }
  }
  return null;
}

/** Reduce a color's opacity by `transparencyPct` (0–100), MULTIPLYING any existing alpha so a subtle rgba()
 *  line stays subtle at 0. Returns an rgba() string; an unparseable color is returned unchanged. */
export function withTransparency(color: string, transparencyPct: number): string {
  const rgb = parseRgb(color);
  if (!rgb) return color;
  let baseA = 1;
  const c = color.trim().toLowerCase();
  if (c[0] === "#") {
    let h = c.slice(1);
    if (h.length === 4) h = h.split("").map(ch => ch + ch).join("");
    if (h.length === 8) baseA = parseInt(h.slice(6, 8), 16) / 255;
  } else {
    const m = c.match(/^rgba?\(([^)]+)\)/);
    if (m) { const parts = m[1].split(/[,\s/]+/).filter(Boolean); if (parts.length >= 4) baseA = parseFloat(parts[3]); }
  }
  const t = Math.max(0, Math.min(100, isFinite(transparencyPct) ? transparencyPct : 0));
  const a = Math.max(0, Math.min(1, (isFinite(baseA) ? baseA : 1) * (1 - t / 100)));
  return `rgba(${Math.round(rgb[0])},${Math.round(rgb[1])},${Math.round(rgb[2])},${+a.toFixed(3)})`;
}

/** A color as an "r,g,b" triplet for composing rgba() layers; an unparseable/empty color → `fallback`. */
export function rgbTriplet(color: string, fallback: string): string {
  const rgb = parseRgb(color);
  return rgb ? `${Math.round(rgb[0])},${Math.round(rgb[1])},${Math.round(rgb[2])}` : fallback;
}

/** Relative luminance (WCAG) of any CSS color; 0..1. Unknown formats default to 1 (light → dark ink). */
export function luminance(color: string): number {
  const rgb = parseRgb(color);
  if (!rgb) return 1;
  const lin = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}

/** Which ink tone a surface needs. 'auto' decides by luminance (threshold 0.42); else forced. */
export function inkToneFor(surface: string, mode: InkMode = "auto"): InkTone {
  if (mode === "light" || mode === "dark") return mode;
  return surface && luminance(surface) < 0.42 ? "light" : "dark";
}

/** CSS-var override that swaps in the light ink ramp (for dark surfaces). Status-text colors are the
 *  brighter variants that clear WCAG AA (≥4.5:1) on a dark surface; they track the surface tone (not the
 *  theme toggle) since the ink ramp is applied inline on every card. */
export const LIGHT_INK_VARS: { [k: string]: string } = {
  "--ink": "#F4F4F7", "--ink-2": "#D4D4DA", "--muted": "#9AA0AC", "--faint": "#7C808C",
  "--line": "rgba(255,255,255,.12)", "--line-soft": "rgba(255,255,255,.07)",
  "--bg": "rgba(255,255,255,.08)",
  "--pos-text": "#0E9F6E", "--neg-text": "#F0686C", "--warn-text": "#E0A21E",
  "--pos-text-pill": "#1CB182", "--neg-text-pill": "#F0686C",
};

/** CSS-var override that swaps in the dark ink ramp (for light surfaces). Status-text colors are the
 *  darker variants that clear WCAG AA (≥4.5:1) on a light surface. */
export const DARK_INK_VARS: { [k: string]: string } = {
  "--ink": "#16161D", "--ink-2": "#3A3A45", "--muted": "#71717A", "--faint": "#A1A1AA",
  "--line": "rgba(20,20,30,.08)", "--line-soft": "rgba(20,20,30,.05)",
  "--bg": "#F6F6F8",
  "--pos-text": "#0A8056", "--neg-text": "#D23A3E", "--warn-text": "#9A6A0F",
  "--pos-text-pill": "#0A7649", "--neg-text-pill": "#C42E32",
};

export const DEFAULT_LINE = "#5B57E0";
/** The default indigo line lifts to the lighter accent when ink flips to light. */
export const DEFAULT_LINE_ON_DARK = "#8B87F5";
