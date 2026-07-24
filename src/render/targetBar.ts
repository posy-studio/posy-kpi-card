"use strict";
import { el } from "../util/dom";

const clampPct = (n: number) => Math.max(0, Math.min(100, n));

/** Progress bar (cumulative goal) — a track that fills toward the goal. */
export function buildProgressBar(pct: number, color: string): HTMLElement {
  const fill = el("div", { class: "kpi-bar-fill" });
  fill.style.setProperty("width", clampPct(pct) + "%");
  fill.style.setProperty("background", color);
  return el("div", { class: "kpi-bar goal-bar", "aria-hidden": "true" }, fill);
}

/** Fixed-target bullet — fill = value, marker = the benchmark (over/under shown by their relative position).
 *  `markerColor` recolors the target marker when CF colors the target (else it keeps the ink default). */
export function buildBulletBar(barPct: number, markPct: number, fillColor: string, markerColor?: string | null): HTMLElement {
  const fill = el("div", { class: "kpi-bullet-fill" });
  fill.style.setProperty("width", clampPct(barPct) + "%");
  fill.style.setProperty("background", fillColor);
  const mark = el("div", { class: "kpi-bullet-mark" });
  mark.style.setProperty("left", clampPct(markPct) + "%");
  if (markerColor) mark.style.setProperty("background", markerColor);
  return el("div", { class: "kpi-bullet" }, fill, mark);
}
