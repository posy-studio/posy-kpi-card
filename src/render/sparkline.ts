"use strict";
import powerbi from "powerbi-visuals-api";
import * as d3 from "d3";
import { ITooltipServiceWrapper } from "powerbi-visuals-utils-tooltiputils";
import { svg } from "../util/dom";

let GRAD_SEQ = 0;

/** Per-point tooltip wiring for the trend chart (sparkline hover → month + value + field-well measures). */
export interface TrendTooltip {
  wrapper: ITooltipServiceWrapper;
  infos: powerbi.extensibility.VisualTooltipDataItem[][];
  ids: powerbi.extensibility.ISelectionId[];
}

/**
 * Invisible per-category hit bands (full height) bound to the tooltip service, plus optional
 * hover callbacks (used to show the crosshair marker / highlight a bar at the hovered point).
 */
function addHitBands(
  root: SVGElement, centers: number[], w: number, h: number, tip: TrendTooltip,
  onHover?: (i: number) => void, onLeave?: () => void,
): void {
  const n = centers.length;
  const edge = (i: number): [number, number] => [
    i === 0 ? 0 : (centers[i - 1] + centers[i]) / 2,
    i === n - 1 ? w : (centers[i] + centers[i + 1]) / 2,
  ];
  const sel = d3.select(root).selectAll<SVGRectElement, number>(".posy-hit")
    .data(centers.map((_, i) => i))
    .join("rect")
    .attr("class", "posy-hit")
    .attr("x", (i) => edge(i)[0])
    .attr("y", 0)
    .attr("width", (i) => edge(i)[1] - edge(i)[0])
    .attr("height", h)
    .attr("fill", "transparent")
    .style("pointer-events", "all");
  tip.wrapper.addTooltip(sel, (i: number) => tip.infos[i] || [], (i: number) => tip.ids[i]);
  if (onHover) sel.on("mouseenter.marker mousemove.marker", (_e: MouseEvent, i: number) => onHover(i));
  if (onLeave) d3.select(root).on("mouseleave.marker", () => onLeave());
}

export interface SmoothPath { line: string; area: string; pts: [number, number][]; }

/** Smooth (Catmull-Rom → cubic bezier) line + area path — ported verbatim from smoothPath() in kpi-cards.jsx. */
export function smoothPath(values: number[], w: number, h: number, pad: number): SmoothPath {
  const p = pad == null ? 6 : pad;
  const min = Math.min(...values), max = Math.max(...values);
  const rng = (max - min) || 1;
  const pts: [number, number][] = values.map((v, i) => {
    const x = p + (i / (values.length - 1)) * (w - 2 * p);
    const y = (h - p) - ((v - min) / rng) * (h - 2 * p);
    return [x, y];
  });
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  const area = `${d} L ${pts[pts.length - 1][0].toFixed(2)} ${h} L ${pts[0][0].toFixed(2)} ${h} Z`;
  return { line: d, area, pts };
}

export type TrendType = "area" | "line" | "bars";

// Vertical breathing room inside the chart, scaled to its height (so it works tall or short).
const padFor = (h: number) => Math.max(3, Math.min(8, h / 6));

/**
 * Build the trend chart at the container's true pixel size, so it resizes with the
 * card both horizontally AND vertically (1:1 — the end knob stays a circle).
 */
export function buildTrend(values: number[], color: string, type: TrendType, width: number, height: number, tip?: TrendTooltip): SVGElement {
  const w = Math.max(40, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (type === "bars") return buildBars(values, color, w, h, tip);
  return buildSpark(values, color, type === "area", w, h, tip);
}

function newSvg(w: number, h: number): SVGElement {
  return svg("svg", {
    viewBox: `0 0 ${w} ${h}`, width: String(w), height: String(h),
    style: "display:block; overflow:visible;", "aria-hidden": "true", focusable: "false",
  });
}

function buildSpark(values: number[], color: string, fill: boolean, w: number, h: number, tip?: TrendTooltip): SVGElement {
  const { line, area, pts } = smoothPath(values, w, h, padFor(h));
  const last = pts[pts.length - 1];
  const gid = `posy-grad-${GRAD_SEQ++}`;
  const root = newSvg(w, h);

  if (fill) {
    const defs = svg("defs");
    const grad = svg("linearGradient", { id: gid, x1: "0", y1: "0", x2: "0", y2: "1" });
    grad.appendChild(svg("stop", { offset: "0%", "stop-color": color, "stop-opacity": "0.22" }));
    grad.appendChild(svg("stop", { offset: "100%", "stop-color": color, "stop-opacity": "0" }));
    defs.appendChild(grad);
    root.appendChild(defs);
    root.appendChild(svg("path", { d: area, fill: `url(#${gid})` }));
  }

  root.appendChild(svg("path", {
    d: line, fill: "none", stroke: color, "stroke-width": "2.5",
    "stroke-linecap": "round", "stroke-linejoin": "round",
  }));

  // last-point knob — centre matches the card surface so it reads as a ring
  root.appendChild(svg("circle", {
    cx: String(last[0]), cy: String(last[1]), r: "3.5",
    fill: "var(--card)", stroke: color, "stroke-width": "2.5",
  }));

  if (tip) {
    // hover marker: a colored dot on the hovered point (no crosshair line)
    const dot = svg("circle", { r: "4.5", fill: color, stroke: "var(--card)", "stroke-width": "2", "pointer-events": "none" }) as SVGCircleElement;
    dot.style.display = "none";
    root.appendChild(dot);

    addHitBands(root, pts.map(p => p[0]), w, h, tip,
      (i) => {
        dot.setAttribute("cx", String(pts[i][0]));
        dot.setAttribute("cy", String(pts[i][1]));
        dot.style.display = "";
      },
      () => { dot.style.display = "none"; },
    );
  }
  return root;
}

function buildBars(values: number[], color: string, w: number, h: number, tip?: TrendTooltip): SVGElement {
  const n = values.length;
  const gap = Math.max(2, Math.min(8, w * 0.012));
  const bw = (w - gap * (n - 1)) / n;
  const root = newSvg(w, h);

  // Baseline-aware scale: always include 0 in the range so bars grow from a zero baseline — positive
  // values rise above it, negative values hang below it, mixed series straddle it. (The old max-only
  // scale inverted all-negative series — smaller magnitude drew taller — and collapsed all-zero to the
  // floor.) An all-positive series keeps its previous bar heights (now with a small symmetric inset).
  const pad = 3;
  const usableH = Math.max(1, h - 2 * pad);
  const lo = Math.min(...values, 0);
  const hi = Math.max(...values, 0);
  const rng = (hi - lo) || 1;
  const yFor = (v: number) => pad + ((hi - v) / rng) * usableH; // SVG y grows downward
  const yBase = yFor(0);
  const MIN_BAR = 2; // keep a visible sliver for near-baseline / all-zero values

  const baseOpacity = (i: number) => i === n - 1 ? "1" : "0.26";
  const rects: SVGElement[] = values.map((v, i) => {
    const yV = yFor(v);
    const top = Math.min(yBase, yV);
    const bh = Math.max(MIN_BAR, Math.abs(yV - yBase));
    const rect = svg("rect", {
      x: (i * (bw + gap)).toFixed(2), y: top.toFixed(2),
      width: bw.toFixed(2), height: bh.toFixed(2),
      rx: "1.6", fill: color, "fill-opacity": baseOpacity(i),
    });
    root.appendChild(rect);
    return rect;
  });
  if (tip) {
    addHitBands(root, values.map((_, i) => i * (bw + gap) + bw / 2), w, h, tip,
      (i) => rects.forEach((r, j) => r.setAttribute("fill-opacity", j === i ? "1" : "0.26")),
      () => rects.forEach((r, j) => r.setAttribute("fill-opacity", baseOpacity(j))),
    );
  }
  return root;
}
