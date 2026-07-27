"use strict";
import { el, setStyles, clear, parseSvg } from "../util/dom";
import { KpiViewModel } from "../model/viewModel";
import { CFConfig, CfRule, matchIndex, trendColorFor } from "../model/cfConfig";
import {
  inkToneFor, LIGHT_INK_VARS, DARK_INK_VARS, DEFAULT_LINE, DEFAULT_LINE_ON_DARK, InkMode,
  withTransparency, rgbTriplet,
} from "../util/contrast";
import { buildTrend, TrendType, TrendTooltip } from "./sparkline";
import { buildProgressBar, buildBulletBar } from "./targetBar";
import { buildDelta } from "./delta";
import { buildMenu } from "./menu";
import { renderIconMark } from "./icon";
import { formatCallout, formatDeltaPercent, resolveBlank } from "../util/format";

export type Preset = "trend" | "goal" | "headline";

export interface CardProps {
  preset: Preset;
  preview?: boolean; // gallery tile: size the card to its content + a fixed-height trend (not fill)
  theme: "light" | "dark";
  surfacePicked: string;
  linePicked: string;
  inkMode: InkMode;
  cornerRadius: number;
  cardShadow: boolean;
  cardBorder: boolean;
  borderColor: string;        // empty = auto (follows the ink ramp's --line)
  borderTransparency: number; // 0–100, reduces the border's opacity
  shadowColor: string;        // empty = auto (tone-based default)
  showMenu: boolean;
  menuIconSize: number;
  showIcon: boolean;
  iconKind: string;
  kpiIconSize: number;
  iconImageUrl?: string;
  trendType: TrendType;
  goalTargetType: "progress" | "fixed";
  targetLabel: string;
  // Callout value
  displayUnits: string;
  decimals: number;
  calloutFontFamily: string;
  calloutValueSize: number;
  calloutBold: boolean;
  calloutItalic: boolean;
  calloutUnderline: boolean;
  calloutFontColor: string;
  calloutShowBlankAs: string;
  calloutBlankText: string;
  calloutValueWrap: boolean;
  // Callout label
  calloutLabel: string; // eyebrow text override (empty = the bound Value field's name)
  calloutLabelFont: string;
  calloutLabelSize: number;
  calloutLabelColor: string;
  calloutLabelBold: boolean;
  calloutLabelItalic: boolean;
  calloutLabelUnderline: boolean;
  calloutLabelWrap: boolean;
  // Comparison
  showComparison: boolean;
  comparisonLabel: string;
  lowerIsBetter: boolean;
  varianceBackground: boolean;
  // Comparison value (delta)
  deltaValueFont: string;
  deltaValueSize: number;
  deltaValueColor: string;
  deltaValueBold: boolean;
  deltaValueItalic: boolean;
  deltaValueUnderline: boolean;
  deltaShowBlankAs: string;
  deltaBlankText: string;
  deltaValueWrap: boolean;
  // Comparison label
  deltaLabelFont: string;
  deltaLabelSize: number;
  deltaLabelColor: string;
  deltaLabelBold: boolean;
  deltaLabelItalic: boolean;
  deltaLabelUnderline: boolean;
  deltaLabelWrap: boolean;
  // Comparison display — Change (delta %) / Comparison Value (prior-period value) toggles + the value's own formatting.
  showChange: boolean;
  showComparisonValue: boolean;
  cmpFont: string; cmpSize: number; cmpColor: string; cmpBold: boolean; cmpItalic: boolean; cmpUnderline: boolean;
  cmpDisplayUnits: string; cmpDecimals: number; cmpShowBlankAs: string; cmpBlankText: string; cmpWrap: boolean;
  cfEnable: boolean;
  cfConfig: CFConfig; // the whole rule-editor config (per-mode rule lists / trend / apply-to), parsed from JSON
  // Windows High Contrast (host.colorPalette.isHighContrast) — render with ONLY the OS palette.
  highContrast?: { on: boolean; foreground: string; background: string; foregroundSelected: string };
}

// Resolved CF color for the trend line / target bar (undefined = keeps its normal color); `matched` = colored.
interface CfResult { line?: string; matched: boolean; }

/** The number a threshold mode tests (null = not computable on this card → no match). */
function cfReading(basedOn: string, vm: KpiViewModel): number | null {
  if (vm.valueIsBlank) return null;
  if (basedOn === "value") return vm.valueRaw;
  if (basedOn === "pct") return (vm.hasTarget && vm.targetRaw) ? (vm.valueRaw / vm.targetRaw) * 100 : null;
  if (basedOn === "change") return vm.hasComparison ? vm.deltaFraction * 100 : null;
  return null;
}

/** Net direction of the visible trend series (last vs first). */
function cfTrendMove(vals: number[]): "up" | "flat" | "down" {
  const first = vals[0], last = vals[vals.length - 1];
  if (!isFinite(first) || !isFinite(last) || last === first) return "flat";
  return last > first ? "up" : "down";
}

/**
 * Conditional formatting. Evaluates the ACTIVE "Based on" mode of the config: threshold modes (value /
 * pct / change) run that mode's rule list top-to-bottom — FIRST match wins — against the in-card reading;
 * "trend" colors by the series' net direction (sentiment-aware). The matched color recolors the trend
 * line / target bar only (the callout value is always excluded).
 */
function computeCf(vm: KpiViewModel, props: CardProps): CfResult {
  const res: CfResult = { matched: false };
  if (props.highContrast && props.highContrast.on) return res; // HC uses the OS palette, not CF colors
  const cfg = props.cfConfig;
  if (!props.cfEnable || !cfg) return res;
  // Recolor only the element the current layout actually renders, gated by its own toggle.
  const applies = props.preset === "trend" ? cfg.applyTrendLine
    : props.preset === "goal" ? cfg.applyTargetBar : false; // headline has no chart element
  if (!applies) return res;
  let color = "";
  if (cfg.basedOn === "trend") {
    if (vm.hasTrend && vm.trendValues.length >= 2) color = trendColorFor(cfg.trend, cfTrendMove(vm.trendValues));
  } else {
    const reading = cfReading(cfg.basedOn, vm);
    if (reading !== null && isFinite(reading)) {
      const rules: CfRule[] = cfg.rules[cfg.basedOn as "value" | "pct" | "change"] || [];
      const i = matchIndex(rules, reading);
      if (i >= 0) color = rules[i].color;
    }
  }
  if (color) { res.line = color; res.matched = true; }
  return res;
}

export interface Chrome { surface: string; tone: "light" | "dark"; inkVars: { [k: string]: string }; line: string; }

// Tuned "D" shadows — soft enough to fit within the card inset (no clipping at the visual edge).
/** The card's drop shadow for a surface tone, optionally recolored by the author. An empty color reproduces
 *  the original defaults exactly: darker "0,0,0" on light surfaces, softer "16,16,30" on dark surfaces. */
function shadowFor(tone: "light" | "dark", color: string): string {
  const rgb = rgbTriplet(color, tone === "light" ? "0,0,0" : "16,16,30");
  return tone === "light"
    ? `0 2px 6px rgba(${rgb},.35), 0 12px 22px -12px rgba(${rgb},.6)`   // darker shadow on light surfaces
    : `0 2px 6px rgba(${rgb},.06), 0 10px 18px -10px rgba(${rgb},.16)`; // softer shadow on dark surfaces
}

export function resolveChrome(props: CardProps): Chrome {
  const hc = props.highContrast;
  if (hc && hc.on) {
    // Windows High Contrast: use ONLY the OS palette — foreground for all text/lines/borders on the OS
    // background, the selected color for the trend line / target bar. HC has ~4 colors → no tint/muted variants.
    const fg = hc.foreground, bg = hc.background, sel = hc.foregroundSelected || fg;
    const inkVars: { [k: string]: string } = {
      "--ink": fg, "--ink-2": fg, "--muted": fg, "--faint": fg, "--line": fg, "--line-soft": fg, "--bg": bg,
      "--pos-text": fg, "--neg-text": fg, "--warn-text": fg, "--pos-text-pill": fg, "--neg-text-pill": fg,
    };
    return { surface: bg, tone: inkToneFor(bg, "auto"), inkVars, line: sel };
  }
  const defaultSurface = props.theme === "dark" ? "#191920" : "#FFFFFF";
  const picked = props.surfacePicked || "#FFFFFF";
  const surface = picked.toUpperCase() === "#FFFFFF" ? defaultSurface : picked;
  const tone = inkToneFor(surface, props.inkMode);
  const inkVars = tone === "light" ? LIGHT_INK_VARS : DARK_INK_VARS;
  let line = props.linePicked || DEFAULT_LINE;
  if (line.toUpperCase() === DEFAULT_LINE.toUpperCase() && tone === "light") line = DEFAULT_LINE_ON_DARK;
  return { surface, tone, inkVars, line };
}

/**
 * Apply card chrome: surface, radius, ink ramp, and the author-toggled border + shadow.
 * Shadow renders into inset room on the root so it never clips at the visual's edge.
 */
function applyChrome(root: HTMLElement, card: HTMLElement, props: CardProps, chrome: Chrome): void {
  setStyles(card, { "border-radius": props.cornerRadius + "px", background: chrome.surface, "--card": chrome.surface, ...chrome.inkVars });
  root.style.setProperty("padding", (props.cardShadow ? 12 : 4) + "px");
  const hc = props.highContrast && props.highContrast.on;
  card.style.setProperty("box-shadow", (!hc && props.cardShadow) ? shadowFor(chrome.tone, props.shadowColor || "") : "none");
  if (hc) card.style.setProperty("border", "1px solid " + props.highContrast.foreground); // always delineate the card in HC
  else if (!props.cardBorder) card.style.setProperty("border", "none");
  // border on: author's color (or the auto --line), reduced by the transparency %. Empty color + 0% == the CSS default.
  else card.style.setProperty("border", "1px solid " + withTransparency(props.borderColor || chrome.inkVars["--line"], props.borderTransparency));
}

/** Apply author font/size/color/wrap overrides to a text element (empty font/color keep the CSS default). */
function applyTextStyle(node: HTMLElement, font: string, size: number, color: string, wrap: boolean,
                       bold?: boolean, italic?: boolean, underline?: boolean): void {
  if (font) node.style.setProperty("font-family", `"${font}", "Segoe UI", system-ui, sans-serif`);
  if (size) node.style.setProperty("font-size", size + "px");
  if (color) node.style.setProperty("color", color);
  node.style.setProperty("white-space", wrap ? "normal" : "nowrap");
  if (bold) node.style.setProperty("font-weight", "700"); // off = the element's CSS-default weight
  if (italic) node.style.setProperty("font-style", "italic");
  if (underline) node.style.setProperty("text-decoration", "underline");
}

/** The callout value element. Font family, size, and color are author-controlled (color empty =
 *  auto-contrast ink). The size is a fixed px value — no auto-scaling (matches native PBI cards). */
function buildValue(valueFormatted: string, props: CardProps): HTMLElement {
  const node = el("div", { class: "kpi-value" }, valueFormatted);
  if (props.calloutFontFamily) node.style.setProperty("font-family", `"${props.calloutFontFamily}", "Segoe UI", system-ui, sans-serif`);
  // Headline is the dominant-value layout — its value is larger by default (56 vs Trend/Goal 46). Scale the
  // author's size proportionally so there's still a single "Text size" control.
  const size = props.preset === "headline" ? Math.round(props.calloutValueSize * 56 / 46) : props.calloutValueSize;
  node.style.setProperty("font-size", size + "px");
  node.style.setProperty("font-weight", props.calloutBold ? "700" : "400");
  if (props.calloutItalic) node.style.setProperty("font-style", "italic");
  if (props.calloutUnderline) node.style.setProperty("text-decoration", "underline");
  if (props.calloutFontColor) node.style.setProperty("color", props.calloutFontColor);
  node.style.setProperty("white-space", props.calloutValueWrap ? "normal" : "nowrap");
  return node;
}

function fmtVal(n: number, vm: KpiViewModel, props: CardProps): string {
  return formatCallout(n, vm.valueFormatString, props.displayUnits, props.decimals);
}

function srSummary(vm: KpiViewModel, props: CardProps, valueFormatted: string, cfMatched: boolean): string {
  const lbl = props.calloutLabel || vm.label;
  let s = `${lbl}: ${valueFormatted}.`;
  if (props.preset === "goal" && vm.hasTarget) {
    if (props.goalTargetType === "fixed") {
      const over = vm.valueRaw >= vm.targetRaw;
      s += ` ${fmtVal(Math.abs(vm.valueRaw - vm.targetRaw), vm, props)} ${over ? "over" : "under"} ${(props.targetLabel || "target").toLowerCase()} ${fmtVal(vm.targetRaw, vm, props)}.`;
    } else {
      const pct = vm.targetRaw ? Math.round(vm.valueRaw / vm.targetRaw * 100) : 0;
      s += ` ${pct}% to ${fmtVal(vm.targetRaw, vm, props)} goal.`;
    }
  }
  if (props.showComparison && vm.hasComparison) {
    const up = vm.deltaFraction >= 0;
    s += ` ${up ? "Up" : "Down"} ${formatDeltaPercent(vm.deltaFraction)} ${props.comparisonLabel}.`;
  }
  if (cfMatched) s += ` Conditional formatting applied.`;
  return s;
}

/** Goal block — progress bar (cumulative %) or fixed bullet (value vs benchmark, over/under).
 *  `lineColor` paints the bar/fill (CF-aware); the target marker keeps its ink default. */
function buildGoalBlock(vm: KpiViewModel, props: CardProps, lineColor: string): HTMLElement[] {
  if (!vm.hasTarget) return [];
  const value = vm.valueRaw, target = vm.targetRaw;
  const out: HTMLElement[] = [];

  if (props.goalTargetType === "fixed") {
    // Map value + target onto a shared domain that always includes 0, so a negative value/target can't invert
    // the bar (a raw Math.max goes negative when both are negative → the worse value drew a fuller bar). The
    // all-positive case is unchanged: lo=0 makes span == the old Math.max(value,target)*1.1.
    const lo = Math.min(0, value, target);
    const hi = Math.max(0, value, target);
    const span = (hi - lo) * 1.1 || 1; // 10% headroom; guard the value==target==0 case
    const over = value >= target;
    const good = props.lowerIsBetter ? value <= target : value >= target;
    out.push(el("div", { class: "kpi-goal-sub" }, `${props.targetLabel || "Target"} · ${fmtVal(target, vm, props)}`));
    out.push(el("div", { class: "kpi-bullet-wrap", "aria-hidden": "true" }, buildBulletBar((value - lo) / span * 100, (target - lo) / span * 100, lineColor)));
    out.push(el("div", { class: "kpi-goal-foot" }, el("span", { class: `tgt-status ${good ? "pos" : "neg"}` }, `${fmtVal(Math.abs(value - target), vm, props)} ${over ? "over" : "under"}`)));
  } else {
    const pct = target > 0 ? Math.round(value / target * 100) : 0; // progress needs a positive goal; non-positive target → 0%
    out.push(el("div", { class: "kpi-goal-sub" }, `of ${fmtVal(target, vm, props)} target`));
    out.push(buildProgressBar(pct, lineColor));
    out.push(el("div", { class: "kpi-goal-foot" }, el("span", { class: "tgt-status" }, `${pct}% to goal`)));
  }
  return out;
}

function buildHead(vm: KpiViewModel, props: CardProps, iconColor: string): HTMLElement {
  const head = el("div", { class: "kpi-head" });
  if (props.showIcon) head.appendChild(renderIconMark(props.iconKind, iconColor, props.kpiIconSize, props.iconImageUrl));
  const labelEl = el("div", { class: "kpi-label" }, props.calloutLabel || vm.label);
  applyTextStyle(labelEl, props.calloutLabelFont, props.calloutLabelSize, props.calloutLabelColor, props.calloutLabelWrap,
    props.calloutLabelBold, props.calloutLabelItalic, props.calloutLabelUnderline);
  const text = el("div", { class: "kpi-headtext" }, labelEl);
  head.appendChild(text);
  if (props.showMenu) head.appendChild(buildMenu(props.menuIconSize));
  return head;
}

// The comparison row: independent Change (delta ▲/▼ %) and Comparison Value (prior-period value) toggles.
// When the value shows, lead with the capitalized "Period:" label + value and let the change trail as the
// only colored element: both → "Last month: $4.29M ▲ 12.4%"; value-only → "Last month: $4.29M".
// change-only (the default) is unchanged → "▲ 12.4% vs last month". neither → hidden.
function buildCompareRow(vm: KpiViewModel, props: CardProps): HTMLElement | null {
  if (!props.showComparison || !vm.comparisonBound) return null;
  const showDelta = props.showChange, showValue = props.showComparisonValue;
  if (!showDelta && !showValue) return null;

  // --- Change (the delta ▲/▼ %) ---
  let deltaEl: HTMLElement | null = null;
  if (showDelta) {
    if (vm.hasComparison) {
      const actualUp = vm.deltaFraction >= 0;
      const good = props.lowerIsBetter ? !actualUp : actualUp;
      deltaEl = buildDelta({
        text: formatDeltaPercent(vm.deltaFraction),
        positive: good, directionUp: actualUp, background: props.varianceBackground,
        fontFamily: props.deltaValueFont, fontSize: props.deltaValueSize,
        color: props.deltaValueColor, wrap: props.deltaValueWrap,
        bold: props.deltaValueBold, italic: props.deltaValueItalic, underline: props.deltaValueUnderline,
      });
    } else {
      // Comparison bound but blank → the "show blank as" placeholder (nothing if "Blank").
      const blank = resolveBlank(props.deltaShowBlankAs, props.deltaBlankText);
      if (blank) {
        const blankNum = el("span", {}, blank);
        if (props.deltaValueUnderline) blankNum.style.setProperty("text-decoration", "underline");
        deltaEl = el("span", { class: "delta delta-blank" }, blankNum);
        applyTextStyle(deltaEl, props.deltaValueFont, props.deltaValueSize, props.deltaValueColor, props.deltaValueWrap,
          props.deltaValueBold, props.deltaValueItalic);
      }
    }
  }
  // Change-only (the default) with a blank, hidden delta → hide the whole row, as before.
  if (showDelta && !showValue && !deltaEl) return null;

  // --- Caption + ordering ---
  // Change-only (default): the full "vs …" label trails the delta — "▲ 12.4% vs last month" (unchanged).
  // When the value shows: lead with the capitalized "Period:" label + value; the delta trails as the only
  // colored element — "Last month: $4.29M ▲ 12.4%" (both) / "Last month: $4.29M" (value-only).
  const label = props.comparisonLabel || (vm.comparisonName ? "vs " + vm.comparisonName : "");
  const captionEl = el("span", { class: "kpi-vs" });
  applyTextStyle(captionEl, props.deltaLabelFont, props.deltaLabelSize, props.deltaLabelColor, props.deltaLabelWrap,
    props.deltaLabelBold, props.deltaLabelItalic, props.deltaLabelUnderline);

  if (showValue) {
    const raw = label.replace(/^vs\s+/i, "");                            // drop the leading "vs " → "last month"
    const period = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : ""; // capitalize → "Last month"
    const cmpText = vm.comparisonIsBlank
      ? resolveBlank(props.cmpShowBlankAs, props.cmpBlankText)
      : formatCallout(vm.comparisonRaw, vm.comparisonFormat, props.cmpDisplayUnits, props.cmpDecimals);
    if (cmpText) {
      if (period) captionEl.appendChild(document.createTextNode(period + ": ")); // "Last month: "
      const cmpEl = el("span", { class: "cmpv" }, cmpText);
      // force an explicit color (author's, or the secondary-ink default) so it never inherits the label color
      applyTextStyle(cmpEl, props.cmpFont, props.cmpSize, props.cmpColor || "var(--ink-2)", props.cmpWrap,
        props.cmpBold, props.cmpItalic, props.cmpUnderline);
      captionEl.appendChild(cmpEl);
    } else if (period) {
      captionEl.appendChild(document.createTextNode(period)); // blank value → period only (no dangling colon)
    }
  } else {
    captionEl.appendChild(document.createTextNode(label));                // change-only: "vs last month"
  }

  if (!deltaEl && !captionEl.firstChild) return null; // nothing to show
  const row = el("div", { class: "kpi-compare-row" });
  if (showValue) {
    row.appendChild(captionEl);              // label → value lead
    if (deltaEl) row.appendChild(deltaEl);   // change trails (the only colored element)
  } else {
    if (deltaEl) row.appendChild(deltaEl);   // change-only: delta leads
    row.appendChild(captionEl);              // "vs …" trails (unchanged)
  }
  return row;
}

/** Render the card for the current view model + resolved props. */
export function renderCard(parent: HTMLElement, vm: KpiViewModel, props: CardProps, tip?: TrendTooltip): void {
  clear(parent);
  const chrome = resolveChrome(props);
  const valueFormatted = vm.valueIsBlank
    ? resolveBlank(props.calloutShowBlankAs, props.calloutBlankText)
    : formatCallout(vm.valueRaw, vm.valueFormatString, props.displayUnits, props.decimals);

  // Conditional formatting recolors only the trend line / target bar (the first matching rule's color).
  const cf = computeCf(vm, props);
  const lineColor = cf.line || chrome.line;

  const root = el("div", { class: props.preview ? "posy-root preview" : "posy-root" });
  const variantClass = props.preset === "headline" ? "headline" : props.preset === "goal" ? "goal" : "";
  const card = el("div", {
    class: `kpi-card hero compact ${variantClass} ${props.theme === "dark" ? "dark" : ""} ${props.preview ? "preview" : ""}`.replace(/\s+/g, " ").trim(),
    role: "group", "aria-roledescription": "KPI card",
    "aria-label": srSummary(vm, props, valueFormatted, cf.matched),
    // NB: no tabindex — an inert card that grabs focus traps it in the sandbox iframe and swallows the
    // host's Delete key (you couldn't delete the visual). The menu button stays keyboard-focusable.
  });
  applyChrome(root, card, props, chrome);

  card.appendChild(buildHead(vm, props, chrome.line));
  card.appendChild(buildValue(valueFormatted, props));

  const compare = buildCompareRow(vm, props);
  if (compare) card.appendChild(compare);

  // Preset body: Goal → progress/bullet; Trend → sparkline; Headline → nothing.
  let trendHost: HTMLElement | null = null;
  if (props.preset === "goal") {
    for (const node of buildGoalBlock(vm, props, lineColor)) card.appendChild(node);
  } else if (props.preset !== "headline" && vm.hasTrend) {
    trendHost = el("div", { class: "kpi-trend", "aria-hidden": "true" });
    card.appendChild(trendHost);
  }

  root.appendChild(card);
  parent.appendChild(root);

  // Now in the DOM: draw the sparkline at the container's real pixel size so it resizes
  // with the card both horizontally and vertically.
  if (trendHost) {
    const w = trendHost.clientWidth;
    const h = trendHost.clientHeight;
    if (w > 0 && h > 0) trendHost.appendChild(buildTrend(vm.trendValues, lineColor, props.trendType, w, h, tip));
  }
}

/** Posy brand marks for the empty state (ported from the handoff's PosyMark / PosyWordmark SVGs). */
const POSY_MARK_D = "M225 150H224.94V149.97H225V150C266.445 150 300 116.415 300 75.015C300 33.615 266.445 0 225 0C183.555 0 150 33.585 150 74.985C149.985 54.285 141.6 35.55 128.04 21.975C114.465 8.4 95.715 0 75 0C33.555 0 0 33.585 0 74.985C0 116.385 33.585 149.97 75 149.97V150.045H1.95V224.55C25.365 213.96 51.315 216.165 67.575 232.47C83.805 248.775 86.085 274.59 75.495 298.05H150.03V226.305C150.75 267.105 184.035 299.97 225 299.97V300C266.445 300 300 266.415 300 225.015C300 183.615 266.445 150 225 150ZM206.25 206.25H150.03V150.045H93.75V93.75H206.25V206.25Z";
const POSY_WORD_D = "M71 96.80C55 96.80 42.40 103.60 34.80 114.60L34.80 99.40L14 99.40L14 242L35.20 242L35.20 196.60L34.80 196.60L34.80 184.80C42.40 195.80 55 202.60 71 202.60C99.40 202.60 121.20 180 121.20 149.60C121.20 119.40 99.40 96.80 71 96.80ZM67.60 183.60C49.40 183.60 34.60 169.40 34.60 149.60C34.60 130.20 49.40 116 67.60 116C86.60 116 100.20 130 100.20 149.60C100.20 169.40 86.60 183.60 67.60 183.60ZM190 202.60C220.80 202.60 243.40 179.80 243.40 149.60C243.40 119.60 220.80 96.80 190 96.80C159.20 96.80 136.40 119.60 136.40 149.60C136.40 179.80 159.20 202.60 190 202.60ZM190 183.40C170.80 183.40 157.20 169 157.20 149.80C157.20 130.60 170.80 116.20 190 116.20C209 116.20 222.60 130.60 222.60 149.80C222.60 169 209 183.40 190 183.40ZM302.40 202.60C326.80 202.60 344.60 189 344.60 170.80C344.60 153.40 332.20 147 318 142.60L293.20 135C286.40 133 282.40 130.20 282.40 125.40C282.40 119.20 289.80 113.80 301.40 113.80C313.20 113.80 322.80 120.20 325.20 127.60L343.40 122.20C338.20 107.60 323.20 96.80 301.20 96.80C279.20 96.80 261.40 110 261.40 126.40C261.40 140.60 272.20 148.40 285.60 152.40L310.80 160C319.40 162.60 323.80 166 323.80 171.80C323.80 179.20 315.40 185.20 302.80 185.20C288.40 185.20 276.60 177 274.40 166.40L255.60 172C259.40 188.40 277 202.60 302.40 202.60ZM404.20 173.80L370.80 99.40L347.60 99.40L393.60 197.80L375 242L396.80 242L458 99.40L435.40 99.40Z";
function posyMark(size: number, fill: string): SVGElement {
  return parseSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 300 300" fill="none" aria-hidden="true"><path d="${POSY_MARK_D}" fill="${fill}"/></svg>`);
}
function posyWordmark(height: number, fill: string): SVGElement {
  const w = (height * 456 / 157.2).toFixed(2);
  return parseSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${height}" viewBox="8 90.8 456 157.2" fill="none" aria-hidden="true"><path d="${POSY_WORD_D}" fill="${fill}" stroke="${fill}" stroke-width="4.4" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke"/></svg>`);
}

/** No-data state — a branded landing shown when the Value role is unbound. */
export function renderEmpty(parent: HTMLElement, props: CardProps): void {
  clear(parent);
  const chrome = resolveChrome(props);
  const onDark = chrome.tone === "light"; // light ink ⇒ dark surface ⇒ dark-mode branding
  const root = el("div", { class: "posy-root" });
  const card = el("div", {
    class: `kpi-card hero empty-card ${onDark ? "dark" : ""}`.replace(/\s+/g, " ").trim(),
    role: "group", "aria-roledescription": "KPI card",
    "aria-label": "KPI Card by Posy — no data to display. Add a measure to the Value field.",
  });
  applyChrome(root, card, props, chrome);

  // Brand lockup pinned top-left: Posy mark in an accent chip + the wordmark (per the design handoff).
  const chip = el("span", { class: "kpi-empty-mark" }, posyMark(17, onDark ? "#ADA2F7" : "var(--accent)"));
  chip.style.setProperty("background", onDark ? "rgba(173,162,247,.16)" : "var(--accent-tint)"); // tone-aware chip bg
  const brand = el("div", { class: "kpi-empty-brand", "aria-hidden": "true" },
    chip, posyWordmark(15, onDark ? "#F4F4F7" : "#1A0A32"));

  // Centered message: product eyebrow + title + actionable hint.
  const empty = el("div", { class: "kpi-empty" },
    el("div", { class: "kpi-empty-name" }, "KPI Card by Posy"),
    el("div", { class: "kpi-empty-t" }, "No data to display"),
    el("div", { class: "kpi-empty-s" }, "Add a measure to the Value field"));

  card.appendChild(brand);
  card.appendChild(empty);
  root.appendChild(card);
  parent.appendChild(root);
}

/** Loading state — a subtle shimmer placeholder while data loads (static under reduced-motion). */
export function renderSkeleton(parent: HTMLElement, props: CardProps): void {
  clear(parent);
  const chrome = resolveChrome(props);
  const root = el("div", { class: "posy-root" });
  const card = el("div", {
    class: `kpi-card hero compact ${props.theme === "dark" ? "dark" : ""}`.replace(/\s+/g, " ").trim(),
    role: "img", "aria-label": "Loading…", "aria-busy": "true",
  });
  applyChrome(root, card, props, chrome);

  const skel = (styles: { [k: string]: string }): HTMLElement => {
    const b = el("div", { class: "skel" });
    setStyles(b, styles);
    return b;
  };

  card.appendChild(el("div", { class: "kpi-head" },
    skel({ width: "17px", height: "17px", "border-radius": "5px" }),
    el("div", { class: "kpi-headtext" }, skel({ width: "120px", height: "11px", "border-radius": "6px" }))));
  card.appendChild(skel({ width: "180px", height: "46px", "border-radius": "11px", "margin-top": "18px" }));
  card.appendChild(skel({ width: "100%", "border-radius": "12px", "margin-top": "20px", flex: "1 1 auto", "min-height": "56px" }));

  root.appendChild(card);
  parent.appendChild(root);
}
