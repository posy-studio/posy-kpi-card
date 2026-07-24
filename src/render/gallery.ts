"use strict";
import { el, parseSvg, clear } from "../util/dom";
import { CardProps, Preset } from "./card";
import { TrendType } from "./sparkline";
import { GALLERY_SVGS } from "./gallerySvgs";

/** A layout selection: the preset plus its chart sub-type where one applies. */
export interface LayoutPick { preset: Preset; trendType?: TrendType; goalType?: "progress" | "fixed"; }
interface LayoutTile extends LayoutPick { id: string; name: string; }
interface LayoutGroup { name: string; desc: string; tiles: LayoutTile[]; }

// Every card configuration, grouped by family. Each tile's preview is a static SVG (keyed by `id`,
// from layout-svgs/*.svg). Group names/descriptions + tile names mirror the v2 design; per-tile sub-type
// descriptions were dropped (just the name shows under each preview).
const GROUPS: LayoutGroup[] = [
  { name: "Trend", desc: "Value, delta & a trend chart", tiles: [
    { id: "trend-area", name: "Area", preset: "trend", trendType: "area" },
    { id: "trend-line", name: "Line", preset: "trend", trendType: "line" },
    { id: "trend-bars", name: "Bars", preset: "trend", trendType: "bars" },
  ] },
  { name: "Target", desc: "Value & progress toward a target", tiles: [
    { id: "goal-progress", name: "Progress", preset: "goal", goalType: "progress" },
    { id: "goal-fixed",    name: "Fixed",    preset: "goal", goalType: "fixed" },
  ] },
  { name: "Headline", desc: "A single dominant number", tiles: [
    { id: "headline", name: "Headline", preset: "headline" },
  ] },
];

const CHECK_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">` +
  `<circle cx="8" cy="8" r="8" fill="#5B57E0"/>` +
  `<path d="M4.5 8.2l2.2 2.2 4.8-4.8" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** The tile is the author's currently-active config (matches the preset and its sub-type). */
function tileSelected(t: LayoutTile, cur: LayoutPick): boolean {
  if (cur.preset !== t.preset) return false;
  if (t.trendType) return cur.trendType === t.trendType;
  if (t.goalType) return cur.goalType === t.goalType;
  return true;
}

/**
 * The on-canvas layout gallery (opened in focus mode). Shows every card configuration grouped by family
 * (Trend → Area/Line/Bars, Goal → Progress/Fixed, Headline). Each tile's preview is a STATIC SVG — a
 * fixed default-styled swatch (not the author's theme/colours/data); it scales to its tile via its own
 * viewBox, so there's no measurement and it can never overflow. `current` is the author's active config
 * (so the matching tile shows selected). Clicking a tile calls onPick with the preset + sub-type — one
 * click sets the layout and its chart sub-type. Dismiss-without-choosing is Power BI's own focus-mode
 * "Back to report" (handled in the visual via isInFocus). `props` is only read for the light/dark chrome.
 */
export function renderGallery(
  parent: HTMLElement, props: CardProps, current: LayoutPick, onPick: (pick: LayoutPick) => void,
): void {
  clear(parent);
  const dark = props.theme === "dark";
  const root = el("div", { class: "posy-root posy-gallery-root" });
  const gallery = el("div", { class: dark ? "lay-gallery v2 on-dark" : "lay-gallery v2" });

  gallery.appendChild(el("div", { class: "lay-gallery-head" },
    el("span", { class: "lay-gallery-title" }, "Choose a layout")));

  const groupsEl = el("div", { class: "lay-groups" });
  for (const group of GROUPS) {
    const groupEl = el("div", { class: "lay-group" },
      el("div", { class: "lay-group-head" },
        el("span", { class: "lay-group-name" }, group.name),
        el("span", { class: "lay-group-desc" }, group.desc)));
    const tilesEl = el("div", { class: "lay-group-tiles" });

    for (const tile of group.tiles) {
      const selected = tileSelected(tile, current);
      const prev = el("div", { class: "lay-tile-prev" });
      const markup = GALLERY_SVGS[tile.id];
      if (markup) prev.appendChild(parseSvg(markup));
      if (selected) prev.appendChild(el("div", { class: "lay-tile-check" }, parseSvg(CHECK_SVG)));

      const btn = el("button", {
        class: selected ? "lay-tile on" : "lay-tile", type: "button",
        "aria-pressed": selected ? "true" : "false",
        "aria-label": `${group.name} — ${tile.name}`,
      },
        prev,
        el("div", { class: "lay-tile-meta" },
          el("span", { class: "lay-tile-name" }, tile.name))) as HTMLButtonElement;
      btn.addEventListener("click", () => onPick({ preset: tile.preset, trendType: tile.trendType, goalType: tile.goalType }));
      tilesEl.appendChild(btn);
    }

    groupEl.appendChild(tilesEl);
    groupsEl.appendChild(groupEl);
  }

  gallery.appendChild(groupsEl);
  root.appendChild(gallery);
  parent.appendChild(root);
}
