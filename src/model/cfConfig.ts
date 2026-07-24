"use strict";
// Conditional-formatting config model — shared by the renderer (computeCf in card.ts) and the rule-editor
// dialog. Persisted as a single JSON string in `conditionalFormatting.config`. Per-mode rule lists: each
// threshold mode (Value / % of Target / Change vs comparison %) keeps its own up-to-4 rules; only the
// active `basedOn` mode evaluates at render time. One shared apply-to (the trend line / target bar).

export type BasedOn = "value" | "pct" | "change" | "trend";
/** Operator glyphs are the stored values (ported verbatim from the design's matchIndex). */
export type Op = ">" | "≥" | "<" | "≤" | "=" | "between" | "is not blank";
export interface CfRule { op: Op; val: string; val2: string; color: string; }
export interface CfTrend { dir: "high" | "low"; good: string; neutral: string; bad: string; }
export interface CFConfig {
  basedOn: BasedOn;
  rules: { value: CfRule[]; pct: CfRule[]; change: CfRule[] };
  trend: CfTrend;
  applyTrendLine: boolean; // recolor the sparkline on a Trend card
  applyTargetBar: boolean; // recolor the progress/bullet bar on a Target card (callout value is always excluded)
}

export const OPS: Op[] = [">", "≥", "<", "≤", "=", "between", "is not blank"];
export const OP_LABEL: { [k: string]: string } = {
  ">": "greater than", "≥": "at least", "<": "less than", "≤": "at most",
  "=": "equals", "between": "between", "is not blank": "is not blank",
};
/** Curated swatch palette for the color popover (+ a custom hex input). */
export const PALETTE = ["#0E9F6E", "#E0A21E", "#E0484C", "#5B57E0", "#2F6BED", "#0EA5A5", "#D97706", "#DB2777", "#16161D", "#71717A"];
export const MAX_RULES = 4;

const SEED_TREND: CfTrend = { dir: "high", good: "#0E9F6E", neutral: "#E0A21E", bad: "#E0484C" };

// Threshold modes start with NO rules — the author adds them in the dialog. Trend keeps its 3 colors.
export function defaultConfig(): CFConfig {
  return {
    basedOn: "value",
    rules: { value: [], pct: [], change: [] },
    trend: { ...SEED_TREND },
    applyTrendLine: false,
    applyTargetBar: false,
  };
}

function sanRule(r: unknown): CfRule {
  const o = (r && typeof r === "object") ? r as Record<string, unknown> : {};
  const op = OPS.indexOf(o.op as Op) >= 0 ? o.op as Op : ">";
  return { op, val: String(o.val ?? ""), val2: String(o.val2 ?? ""), color: typeof o.color === "string" ? o.color : "#5B57E0" };
}
function sanRules(arr: unknown): CfRule[] {
  const a = Array.isArray(arr) ? arr.slice(0, MAX_RULES).map(sanRule) : [];
  return a.length ? a : [];
}

/** Parse the persisted JSON config, defensively merged onto defaults (empty/invalid → defaults). */
export function parseConfig(json: string | undefined): CFConfig {
  const d = defaultConfig();
  if (!json) return d;
  let o: Record<string, unknown>;
  try { o = JSON.parse(json); } catch { return d; }
  if (!o || typeof o !== "object") return d;
  const basedOn = (["value", "pct", "change", "trend"] as BasedOn[]).indexOf(o.basedOn as BasedOn) >= 0 ? o.basedOn as BasedOn : d.basedOn;
  const rin = (o.rules && typeof o.rules === "object") ? o.rules as Record<string, unknown> : {};
  const rules = {
    value: rin.value !== undefined ? sanRules(rin.value) : d.rules.value,
    pct: rin.pct !== undefined ? sanRules(rin.pct) : d.rules.pct,
    change: rin.change !== undefined ? sanRules(rin.change) : d.rules.change,
  };
  // threshold modes may legitimately have zero rules (the author adds them) — no min-1 restore
  const tin = (o.trend && typeof o.trend === "object") ? o.trend as Record<string, unknown> : {};
  const trend: CfTrend = {
    dir: tin.dir === "low" ? "low" : "high",
    good: typeof tin.good === "string" ? tin.good : d.trend.good,
    neutral: typeof tin.neutral === "string" ? tin.neutral : d.trend.neutral,
    bad: typeof tin.bad === "string" ? tin.bad : d.trend.bad,
  };
  // Apply-to per element. New split fields win; else migrate an old single `applyLine` (true→both true,
  // false→both false — so existing reports keep coloring); else neither present ⇒ the default (off).
  const applyTrendLine = typeof o.applyTrendLine === "boolean" ? o.applyTrendLine
    : typeof o.applyLine === "boolean" ? o.applyLine : d.applyTrendLine;
  const applyTargetBar = typeof o.applyTargetBar === "boolean" ? o.applyTargetBar
    : typeof o.applyLine === "boolean" ? o.applyLine : d.applyTargetBar;
  return { basedOn, rules, trend, applyTrendLine, applyTargetBar };
}

export function serializeConfig(cfg: CFConfig): string {
  return JSON.stringify(cfg);
}

/** Parse a rule's threshold value. Accepts plain numbers ("3000000"), grouped ("3,000,000"), and
 *  magnitude suffixes ("3K"/"3M"/"3B"/"3T", case-insensitive) → the raw number. Unparseable ⇒ NaN
 *  (matchIndex then ignores that condition, as before). The reading compared against is the RAW measure
 *  value, so "3M" means 3,000,000 — matching what the card evaluates (the callout's display units, which
 *  only scale how the number is *shown*, never enter into this). */
export function parseRuleValue(s: string): number {
  if (s == null) return NaN;
  const t = String(s).trim().replace(/,/g, "");
  const m = /^(-?\d*\.?\d+)\s*([kmbt])?$/i.exec(t);
  if (!m) return NaN;
  const n = parseFloat(m[1]);
  if (!isFinite(n)) return NaN;
  const mults: { [k: string]: number } = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };
  return n * (mults[(m[2] || "").toLowerCase()] || 1);
}

/** First-match-wins (threshold modes) — ported verbatim from the design's matchIndex. An unset value
 *  (NaN, and not "is not blank") is ignored; returns the winning rule index, or -1 for no match. */
export function matchIndex(rules: CfRule[], reading: number): number {
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    if (r.op === "is not blank") return i;        // reading present ⇒ matches
    const a = parseRuleValue(r.val);
    if (isNaN(a)) continue;                        // unset condition ⇒ ignored
    let hit = false;
    switch (r.op) {
      case ">":  hit = reading > a; break;
      case "≥":  hit = reading >= a; break;
      case "<":  hit = reading < a; break;
      case "≤":  hit = reading <= a; break;
      case "=":  hit = Math.abs(reading - a) < 1e-6; break;
      case "between": {
        const b = parseRuleValue(r.val2);
        if (isNaN(b)) break;
        hit = reading >= Math.min(a, b) && reading <= Math.max(a, b);
      } break;
    }
    if (hit) return i;
  }
  return -1;
}

/** Trend-direction → color (sentiment-aware). `move` is the data's net direction. */
export function trendColorFor(t: CfTrend, move: "up" | "flat" | "down"): string {
  if (move === "flat") return t.neutral;
  const good = (t.dir === "high") === (move === "up");
  return good ? t.good : t.bad;
}
