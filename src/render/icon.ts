"use strict";
import { parseSvg, el } from "../util/dom";

const SVGNS = `xmlns="http://www.w3.org/2000/svg"`;

/** 17 single-color glyphs (22×22 viewBox) — inner SVG markup, ported from GLYPH_INNER in kpi-cards.jsx. */
const GLYPH_INNER: { [k: string]: (c: string) => string } = {
  bars: c => `<g fill="${c}"><rect x="5" y="11" width="3.2" height="6" rx="1.2"/><rect x="10.4" y="8" width="3.2" height="9" rx="1.2"/><rect x="15.8" y="5" width="3.2" height="12" rx="1.2"/></g>`,
  trend: c => `<g fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.5 L9 9.5 L12 12 L18 6"/><path d="M13.5 6 H18 V10.5"/></g>`,
  pulse: c => `<path fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M3.5 11.5H7l2-4.5 3.4 9 2-4.5h3.6"/>`,
  dollar: c => `<g fill="none" stroke="${c}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M14.3 7.4c-.8-1-2.1-1.5-3.5-1.4-1.7.1-3 .9-3 2.3 0 1.5 1.5 2 3.5 2.4s3.5 1 3.5 2.6c0 1.5-1.5 2.4-3.3 2.5-1.6.1-3-.5-3.8-1.5"/><path d="M11 4v2.1M11 15.8v2.1"/></g>`,
  coin: c => `<g fill="none" stroke="${c}" stroke-width="2.2"><circle cx="11" cy="11" r="6"/><path d="M9 11h4M11 9v4" stroke-width="1.8"/></g>`,
  percent: c => `<g stroke="${c}" stroke-width="2.1" stroke-linecap="round"><line x1="6.5" y1="15.5" x2="15.5" y2="6.5"/><g fill="${c}" stroke="none"><circle cx="7.6" cy="7.6" r="1.7"/><circle cx="14.4" cy="14.4" r="1.7"/></g></g>`,
  cart: c => `<g fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h2l1.6 7.5h8L18.5 7H7"/><circle cx="9" cy="16.5" r="1.2" fill="${c}" stroke="none"/><circle cx="15.5" cy="16.5" r="1.2" fill="${c}" stroke="none"/></g>`,
  package: c => `<g fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="7" width="12" height="10" rx="1.6"/><path d="M5 10.5h12M11 7v3.5"/><path d="M8 4.5h6l1.5 2.5h-9z"/></g>`,
  user: c => `<g fill="${c}"><circle cx="11" cy="8" r="3.2"/><path d="M5 17c0-3.3 2.7-5 6-5s6 1.7 6 5z"/></g>`,
  globe: c => `<g fill="none" stroke="${c}" stroke-width="2"><circle cx="11" cy="11" r="6.4"/><path d="M4.6 11h12.8M11 4.6c1.8 1.7 2.8 4 2.8 6.4s-1 4.7-2.8 6.4c-1.8-1.7-2.8-4-2.8-6.4s1-4.7 2.8-6.4z"/></g>`,
  target: c => `<g fill="none" stroke="${c}" stroke-width="2.2"><circle cx="11" cy="11" r="6.5"/><circle cx="11" cy="11" r="2.4" fill="${c}" stroke="none"/></g>`,
  flag: c => `<g fill="none" stroke="${c}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v14"/><path d="M6 5h8.5l-1.5 3 1.5 3H6z" fill="${c}" stroke="none"/></g>`,
  clock: c => `<g fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6.4"/><path d="M11 7.4V11l2.6 1.8"/></g>`,
  calendar: c => `<g fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="5.5" width="13" height="12" rx="2"/><path d="M4.5 9h13M8 4v3M14 4v3"/></g>`,
  star: c => `<path fill="${c}" d="M11 4.2l1.9 3.9 4.3.6-3.1 3 .7 4.3-3.8-2-3.8 2 .7-4.3-3.1-3 4.3-.6z"/>`,
  heart: c => `<path fill="${c}" d="M11 16.8C5.5 13.2 4 10.6 4 8.6 4 6.8 5.4 5.5 7.2 5.5c1.3 0 2.4.7 3 1.7.6-1 1.7-1.7 3-1.7 1.8 0 3.2 1.3 3.2 3.1 0 2-1.5 4.6-7 8.2z"/>`,
  bolt: c => `<path fill="${c}" d="M12 3.5 6 12h4l-1 6.5L16 9.5h-4z"/>`,
};

/** A bare inline mark (no tile) for the compact label row — a built-in glyph or a custom image. */
export function renderIconMark(kind: string, color: string, size: number, imageUrl?: string): Element {
  if (kind === "custom" && imageUrl) {
    return el("img", {
      src: imageUrl, alt: "", width: size, height: size,
      style: `flex:0 0 auto; display:block; object-fit:contain; border-radius:3px; width:${size}px; height:${size}px;`,
      "aria-hidden": "true",
    });
  }
  const inner = (GLYPH_INNER[kind] || GLYPH_INNER.bars)(color);
  return parseSvg(
    `<svg ${SVGNS} width="${size}" height="${size}" viewBox="0 0 22 22" style="flex:0 0 auto; display:block;" aria-hidden="true">${inner}</svg>`
  );
}
