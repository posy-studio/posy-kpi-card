"use strict";

const SVGNS = "http://www.w3.org/2000/svg";

type Attrs = { [k: string]: string | number | null | undefined };
type Kid = Node | string | null | undefined;

function applyAttrs(node: Element, attrs?: Attrs): void {
  if (!attrs) return;
  for (const k of Object.keys(attrs)) {
    const v = attrs[k];
    if (v === null || v === undefined) continue;
    if (k === "text") { node.textContent = String(v); continue; }
    node.setAttribute(k, String(v));
  }
}

function appendKids(node: Node, kids: Kid[]): void {
  for (const kid of kids) {
    if (kid === null || kid === undefined) continue;
    node.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
  }
}

/** Create an HTML element. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, attrs?: Attrs, ...kids: Kid[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  applyAttrs(node, attrs);
  appendKids(node, kids);
  return node;
}

/** Create an SVG element. */
export function svg(tag: string, attrs?: Attrs, ...kids: Kid[]): SVGElement {
  const node = document.createElementNS(SVGNS, tag) as SVGElement;
  applyAttrs(node, attrs);
  appendKids(node, kids);
  return node;
}

/**
 * Parse a self-contained SVG markup string into a live SVGElement (no innerHTML —
 * AppSource certification blocks innerHTML assignment). Used for the static glyph paths.
 */
export function parseSvg(svgString: string): SVGElement {
  const doc = new DOMParser().parseFromString(svgString, "image/svg+xml");
  return document.importNode(doc.documentElement, true) as unknown as SVGElement;
}

/** Apply inline styles (incl. CSS custom properties via setProperty). */
export function setStyles(node: HTMLElement, styles: { [k: string]: string | number | null | undefined }): void {
  for (const k of Object.keys(styles)) {
    const v = styles[k];
    if (v === null || v === undefined) continue;
    node.style.setProperty(k, String(v));
  }
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}
