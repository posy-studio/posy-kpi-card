"use strict";
import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import DataViewMatrixNode = powerbi.DataViewMatrixNode;
import DataViewMetadataColumn = powerbi.DataViewMetadataColumn;
import { formatLabel } from "../util/format";

export interface KpiViewModel {
  hasValue: boolean;

  /** Card eyebrow — derived from the Value measure's display name. */
  label: string;

  /** Headline value: the Value measure's DAX grand total (the matrix total node — correct for any measure). */
  valueRaw: number;
  valueFormatString: string;
  valueIsBlank: boolean; // Value field is bound but evaluates blank → render the "show blank as" placeholder

  /** Per-category series for the sparkline (the Value measure over the Trend axis). */
  trendValues: number[];
  trendLabels: string[];
  trendValueName: string;
  trendValueFormat: string;
  hasTrend: boolean;

  /** Extra measures dragged into the Tooltips field well (per-category values). */
  tooltipColumns: { displayName: string; format: string; values: number[] }[];

  /** Comparison (prior period / budget) → delta. */
  hasComparison: boolean;       // a delta can be computed (comparison bound, non-zero, value present)
  comparisonBound: boolean;     // a comparison field is bound (may still be blank)
  comparisonIsBlank: boolean;   // comparison bound but evaluates blank
  comparisonRaw: number;
  comparisonName: string; // the comparison field's display name (for the default "vs …" label)
  comparisonFormat: string; // the comparison measure's format string (for the Comparison Value display)
  deltaFraction: number; // (value − comparison) / comparison
  /** The VALUE measure is percent-typed (its format string contains "%") → the delta renders as
   *  percentage POINTS (deltaPoints) instead of relative % change. */
  valueIsPercent: boolean;
  deltaPoints: number; // (value − comparison) × 100 — movement in percentage points

  /** Target (goal / benchmark). */
  hasTarget: boolean;
  targetRaw: number;

  /** Internal: the per-period matrix leaf nodes (index-aligned to trendValues) for tooltip selection ids. Not for render. */
  trendNodes?: DataViewMatrixNode[];
}

/** True when a Value field is bound (in metadata) but the matrix data hasn't arrived yet — i.e. loading. */
export function isLoading(dataView: DataView | undefined): boolean {
  if (!dataView) return false;
  const cols = dataView.metadata && dataView.metadata.columns;
  const valueBound = !!(cols && cols.some(c => c.roles && c.roles.value));
  const hasMatrix = !!(dataView.matrix && dataView.matrix.rows && dataView.matrix.rows.root);
  return valueBound && !hasMatrix;
}

interface RoleIndices { value?: number; comparison?: number; target?: number; tooltips: number[]; }

/** Map each matrix value source (a measure) to the role it fills. value/comparison/target are single;
 *  tooltips may be several. Indices are derived from `.roles` — never positional — so an unbound role
 *  (whose source is simply absent) doesn't shift the others. */
function roleIndices(sources: DataViewMetadataColumn[]): RoleIndices {
  const idx: RoleIndices = { tooltips: [] };
  sources.forEach((src, i) => {
    const roles = src.roles || {};
    if (roles.value && idx.value === undefined) idx.value = i;
    if (roles.comparison && idx.comparison === undefined) idx.comparison = i;
    if (roles.target && idx.target === undefined) idx.target = i;
    if (roles.tooltips) idx.tooltips.push(i);
  });
  return idx;
}

/** A measure cell on a matrix node → finite number, or undefined (blank / missing / non-finite). */
function cellNum(node: DataViewMatrixNode | undefined, idx: number | undefined): number | undefined {
  if (idx === undefined || !node || !node.values) return undefined;
  const cell = node.values[idx];
  if (!cell || cell.value === null || cell.value === undefined) return undefined;
  const n = Number(cell.value);
  return isFinite(n) ? n : undefined;
}

/** The period label for a row node (prefer levelValues; node.value is deprecated for matrix but a safe fallback). */
function nodeLabel(node: DataViewMatrixNode): powerbi.PrimitiveValue {
  const lv = node.levelValues && node.levelValues[0];
  return (lv && lv.value !== undefined && lv.value !== null) ? lv.value : node.value;
}

/** The trend window (author setting): keep only the last N periods for the sparkline. "all" = every period. */
function windowLeaves(leaves: DataViewMatrixNode[], w: string): DataViewMatrixNode[] {
  const n = w === "last6" ? 6 : w === "last12" ? 12 : 0;   // 0 ⇒ show all
  return (n > 0 && leaves.length > n) ? leaves.slice(-n) : leaves;
}

export function parseDataView(dataView: DataView | undefined, aggMode: string = "total", trendWindow: string = "all", tooltipDateFormat: string = "auto"): KpiViewModel {
  const empty: KpiViewModel = {
    hasValue: false, label: "", valueRaw: 0, valueFormatString: "", valueIsBlank: false,
    trendValues: [], trendLabels: [], trendValueName: "", trendValueFormat: "", hasTrend: false,
    tooltipColumns: [],
    hasComparison: false, comparisonBound: false, comparisonIsBlank: false, comparisonRaw: 0, comparisonName: "", comparisonFormat: "", deltaFraction: 0, valueIsPercent: false, deltaPoints: 0,
    hasTarget: false, targetRaw: 0, trendNodes: [],
  };

  const matrix = dataView && dataView.matrix;
  if (!matrix || !matrix.rows || !matrix.rows.root) return empty;

  const sources = matrix.valueSources || [];
  const idx = roleIndices(sources);
  // Landing/empty state only when the Value field is UNBOUND. A bound-but-blank measure still renders
  // the card (with the author's "show blank as" placeholder), matching native Power BI card behaviour.
  if (idx.value === undefined) return empty;

  const root = matrix.rows.root;
  // The grand-total row is delivered as a child flagged `isSubtotal` — exclude it from the per-period series.
  const leaves = (root.children || []).filter(n => n && !n.isSubtotal);
  // The callout/aggregation use ALL periods; the sparkline shows only the trend window (last N). Slicing
  // just the trend arrays keeps them decoupled — capping the chart never changes the headline number.
  const trendLeaves = windowLeaves(leaves, trendWindow);

  const vsVal = sources[idx.value];
  const valueFormatString = (vsVal.format as string) || "";
  const label = vsVal.displayName || "";

  // The Trend-axis column's format string, for the sparkline/tooltip period labels. Read it from the flat
  // metadata columns BY ROLE first — the matrix row-LEVEL source can arrive with an empty `format` even when
  // the field has one, which regressed the tooltip date after the categorical→matrix migration (the old
  // categorical path read the format off the column metadata, which is what this restores). Level source is a fallback.
  const metaCols = (dataView && dataView.metadata && dataView.metadata.columns) || [];
  const trendCol = metaCols.find(c => c.roles && c.roles.trend);
  const rowLevel = matrix.rows.levels && matrix.rows.levels[0];
  const categoryFormat = (trendCol && (trendCol.format as string))
    || (rowLevel && rowLevel.sources && rowLevel.sources[0] && (rowLevel.sources[0].format as string))
    || "";

  // Per-category series for the sparkline (nulls coerced to 0 so the curve stays continuous).
  const trendValues = trendLeaves.map(n => { const v = cellNum(n, idx.value); return v === undefined ? 0 : v; });
  // Author's "Tooltip date format" overrides the field's format string; "auto" = follow the field.
  const labelFmt = (tooltipDateFormat && tooltipDateFormat !== "auto") ? tooltipDateFormat : categoryFormat;
  // ROOT CAUSE of the tooltip-date regression: the categorical mapping handed the period back as a JS Date
  // (a date format applies cleanly); the matrix mapping hands back a string/number, so NO date format —
  // field format OR explicit preset — can apply to it. If the axis is a date, coerce it back to a Date.
  const colType = (trendCol && trendCol.type) || (rowLevel && rowLevel.sources && rowLevel.sources[0] && rowLevel.sources[0].type);
  const isDateAxis = !!(colType && colType.dateTime);
  const fmtLooksDate = /[dMy]/.test(labelFmt);
  const asLabel = (n: DataViewMatrixNode): powerbi.PrimitiveValue => {
    const raw = nodeLabel(n);
    if (raw == null || Object.prototype.toString.call(raw) === "[object Date]") return raw;
    // Coerce back to a Date for a genuine date axis (string OR number). Otherwise coerce only a date-looking
    // format on a STRING (colType is occasionally absent) — a NUMERIC axis is NEVER coerced, so week 5 can't
    // become new Date(5) → Jan 1970 just because a date format was picked for a non-date trend axis.
    if (isDateAxis || (fmtLooksDate && typeof raw === "string")) {
      const d = new Date(raw as string | number);
      if (!isNaN(d.getTime())) return d as unknown as powerbi.PrimitiveValue;
    }
    return raw;
  };
  const trendLabels = trendLeaves.map(n => formatLabel(asLabel(n), labelFmt));
  const hasTrend = trendValues.length >= 2;

  const tooltipColumns = idx.tooltips.map(ti => ({
    displayName: (sources[ti].displayName as string) || "",
    format: (sources[ti].format as string) || "",
    values: trendLeaves.map(n => { const v = cellNum(n, ti); return v === undefined ? NaN : v; }),
  }));

  // Grand total = the DAX-evaluated total node (correct for ANY measure — matches the native matrix Total
  // row, so a non-additive measure like a "% change" is right, not the sum of the per-period points). Read
  // it from root.values (case A) or the isSubtotal child (case B). Fall back to summing the leaves only if
  // no total node arrived — additive-correct, never blanks the card — and warn (see CLAUDE.md / Desktop check).
  let fellBack = false;
  const grandTotal = (i: number | undefined): number | undefined => {
    if (i === undefined) return undefined;
    const direct = cellNum(root, i);                                   // case A: total on the root node
    if (direct !== undefined) return direct;
    const sub = (root.children || []).find(c => c && c.isSubtotal);    // case B: an isSubtotal child node
    const fromSub = cellNum(sub, i);
    if (fromSub !== undefined) return fromSub;
    let sum = 0, any = false;                                          // fallback: sum the per-period leaves
    for (const n of leaves) { const v = cellNum(n, i); if (v !== undefined) { sum += v; any = true; } }
    if (any) fellBack = true;
    return any ? sum : undefined;
  };

  // The headline aggregation. Default "total" = the correct DAX grand total above. The override
  // (Last/First/Average/Min/Max) collapses THIS source's non-blank per-period leaves — for authors who
  // want the latest point (like the native card / OKViz) or a specific roll-up. With no per-period points
  // (e.g. no Trend bound) every mode falls back to the DAX total. Applied to value/comparison/target alike
  // so the delta % and % of target stay apples-to-apples.
  const aggregate = (i: number | undefined): number | undefined => {
    if (i === undefined) return undefined;
    if (aggMode === "total") return grandTotal(i);
    const vals: number[] = [];
    for (const n of leaves) { const v = cellNum(n, i); if (v !== undefined) vals.push(v); }
    if (!vals.length) return grandTotal(i);                            // no per-period points → the DAX total
    switch (aggMode) {
      case "last":    return vals[vals.length - 1];                    // last/first non-blank in trend order
      case "first":   return vals[0];
      case "average": return vals.reduce((a, b) => a + b, 0) / vals.length;
      case "min":     return vals.reduce((a, b) => Math.min(a, b));    // reduce, not spread — no arg-count limit
      case "max":     return vals.reduce((a, b) => Math.max(a, b));
      default:        return grandTotal(i);
    }
  };

  const valueAgg = aggregate(idx.value);
  const valueIsBlank = valueAgg === undefined;
  const valueRaw = valueAgg ?? 0;

  const comparisonBound = idx.comparison !== undefined;
  const comparisonAgg = aggregate(idx.comparison);
  const comparisonIsBlank = comparisonBound && comparisonAgg === undefined;
  const comparisonRaw = comparisonAgg ?? 0;
  const comparisonName = idx.comparison !== undefined ? ((sources[idx.comparison].displayName as string) || "") : "";
  const comparisonFormat = idx.comparison !== undefined ? ((sources[idx.comparison].format as string) || "") : "";
  const valueIsPercent = valueFormatString.indexOf("%") >= 0;
  // A delta is computable when both sides are present; the relative-% form additionally needs a
  // non-zero base, while the percentage-POINT form (percent-typed value) is defined even at a 0% base.
  const hasComparison = !valueIsBlank && comparisonAgg !== undefined && (valueIsPercent || comparisonAgg !== 0);
  const deltaFraction = hasComparison && comparisonRaw !== 0 ? (valueRaw - comparisonRaw) / comparisonRaw : 0;
  const deltaPoints = (valueRaw - comparisonRaw) * 100;

  const targetAgg = aggregate(idx.target);
  const hasTarget = targetAgg !== undefined;
  const targetRaw = targetAgg ?? 0;

  if (fellBack) {
     
    console.warn("Posy KPI Card: matrix grand total unavailable; summed per-period points instead (correct only for additive measures).");
  }

  return {
    hasValue: true,
    label,
    valueRaw,
    valueFormatString,
    valueIsBlank,
    trendValues,
    trendLabels,
    trendValueName: label || "Value",
    trendValueFormat: valueFormatString,
    hasTrend,
    tooltipColumns,
    hasComparison,
    comparisonBound,
    comparisonIsBlank,
    comparisonRaw,
    comparisonName,
    comparisonFormat,
    deltaFraction,
    valueIsPercent,
    deltaPoints,
    hasTarget,
    targetRaw,
    trendNodes: trendLeaves,
  };
}
