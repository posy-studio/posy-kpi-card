"use strict";
import { el, parseSvg } from "../util/dom";

/**
 * The ⋯ more-options mark — DECORATIVE / inert by design. It renders the glyph but has no menu and no action:
 * it's an opt-in affordance (the author-facing "Menu Icon" toggle is OFF by default) that a real host action
 * can be attached to later. `aria-hidden` because it conveys nothing and does nothing, so assistive tech skips
 * it; there's no cursor/hover/focus affordance, so it never reads as clickable.
 */
export function buildMenu(size: number): HTMLElement {
  const dots = parseSvg(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><circle cx="4" cy="10" r="1.7"/><circle cx="10" cy="10" r="1.7"/><circle cx="16" cy="10" r="1.7"/></svg>`
  );
  return el("div", { class: "kpi-menu", "aria-hidden": "true" }, dots);
}
