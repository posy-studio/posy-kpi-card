"use strict";
import powerbi from "powerbi-visuals-api";
import { valueFormatter } from "powerbi-visuals-utils-formattingutils";

// Viewer locale (host.locale) — set once per update() so every formatter groups numbers/dates and
// renders currency per the report viewer's culture (e.g. "1.234,56" in de-DE), not the engine default.
let LOCALE: string | undefined = undefined;
export function setFormatLocale(locale: string | undefined): void { LOCALE = locale || undefined; }

/** Format a category value (e.g. a Trend month) through its column's format string — so a
 *  Date renders as "Jan 2025" per the model format, not the raw "Wed Jan 01 2025 …" string.
 *  Falls back to a readable date if the column carries no format string. */
export function formatLabel(value: powerbi.PrimitiveValue, formatString: string): string {
  if (value === null || value === undefined) return "";
  const isDate = Object.prototype.toString.call(value) === "[object Date]";
  const fmt = formatString || (isDate ? "MMM d, yyyy" : undefined);
  return valueFormatter.create({ format: fmt, cultureSelector: LOCALE }).format(value);
}

// Display-units magnitude: 0 = auto (let the formatter pick from the value), else force the unit.
const UNIT_MAGNITUDE: { [k: string]: number } = {
  auto: 0, none: 1, thousands: 1e3, millions: 1e6, billions: 1e9,
};

/**
 * Format the callout value in the visual (display units + decimals are author-controlled,
 * per the Callout Value card). The currency symbol / locale still come from the measure's
 * format string when it has one — that's a measure property, not a per-visual display choice.
 */
export function formatCallout(value: number, formatString: string, displayUnits: string, decimals: number): string {
  if (value === null || value === undefined || !isFinite(value)) return "—";
  const mag = UNIT_MAGNITUDE[displayUnits] ?? 0;
  // Guard the author's Decimal places against a corrupted/out-of-range persisted value before it
  // reaches valueFormatter (which can misbehave on NaN/negative/huge precision).
  const prec = Math.max(0, Math.min(15, Math.round(isFinite(decimals) ? decimals : 2)));
  const formatter = valueFormatter.create({
    format: formatString || undefined,
    value: mag === 0 ? value : mag,
    precision: prec,
    cultureSelector: LOCALE,
  });
  // PBI's valueFormatter abbreviates billions as lowercase "bn"; standardize on the single uppercase "B"
  // (to match K / M / T) across every display-units control — callout value, comparison value, CF preview.
  // Applies to explicit Billions and to Auto when it lands on the billions unit. (`bn` only appears as the
  // unit suffix in a formatted number, so this is a safe, targeted swap.)
  return formatter.format(value).replace(/bn\b/, "B");
}

/** Format a value with just the measure's own format string (full value, for tooltip rows). */
export function formatRaw(value: number, formatString: string): string {
  if (value === null || value === undefined || !isFinite(value)) return "—";
  return valueFormatter.create({ format: formatString || undefined, cultureSelector: LOCALE }).format(value);
}

/** The placeholder a value element renders when its measure is blank, per the "Show blank as" choice. */
export function resolveBlank(option: string, customText: string): string {
  switch (option) {
    case "dash":   return "—";
    case "zero":   return "0";
    case "custom": return customText || "";
    default:       return ""; // "blank" — render nothing
  }
}

/** Delta percentage — a computed variance, shown as a bare 1-decimal percent (e.g. "12.4%"). */
export function formatDeltaPercent(fraction: number): string {
  if (!isFinite(fraction)) return "—";
  return (Math.abs(fraction) * 100).toFixed(1) + "%";
}
