"use strict";
import { el, parseSvg } from "../util/dom";

export interface DeltaOptions {
  text: string;        // e.g. "12.4%"
  positive: boolean;   // sentiment (good = green) — already lower-is-better adjusted
  directionUp: boolean;// glyph direction — the actual sign of the change
  background: boolean; // tinted pill (Variance background)
  fontFamily?: string; // author font override
  fontSize?: number;   // author size override (px)
  color?: string;      // author color override (empty = keep sentiment color)
  wrap?: boolean;      // allow the number to wrap
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

/** Delta = bare ▲/▼ glyph + number in the sentiment color (no pill unless Variance background). */
export function buildDelta(o: DeltaOptions): HTMLElement {
  const cls = `delta ${o.positive ? "pos" : "neg"}${o.background ? " delta-bg" : ""}`;
  const flip = o.directionUp ? "" : ` style="transform:scaleY(-1);"`;
  const glyph = parseSvg(
    `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 12 12"${flip} aria-hidden="true"><path d="M6 2 L10.5 8.5 L1.5 8.5 Z" fill="currentColor"/></svg>`
  );
  // Underline goes on the text span, not the `.delta` box — that's display:inline-flex, which doesn't
  // propagate text-decoration to its flex-item text. (Bold/italic inherit into the span normally.)
  const num = el("span", {}, o.text);
  if (o.underline) num.style.setProperty("text-decoration", "underline");
  const node = el("span", { class: cls }, glyph, num);
  if (o.fontFamily) node.style.setProperty("font-family", `"${o.fontFamily}", "Segoe UI", system-ui, sans-serif`);
  if (o.fontSize) node.style.setProperty("font-size", o.fontSize + "px");
  if (o.color) node.style.setProperty("color", o.color);
  if (o.wrap) node.style.setProperty("white-space", "normal");
  if (o.bold) node.style.setProperty("font-weight", "700");
  if (o.italic) node.style.setProperty("font-style", "italic");
  return node;
}
