"use strict";
import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import Card = formattingSettings.SimpleCard;
import CompositeCard = formattingSettings.CompositeCard;
import Group = formattingSettings.Group;
import Model = formattingSettings.Model;
import IEnumMember = powerbi.IEnumMember;
import ValidatorType = powerbi.visuals.ValidatorType;

// "Show blank as" — what a value element renders when its measure evaluates to blank/null.
const BLANK_OPTS: IEnumMember[] = [
  { value: "blank", displayName: "Blank" },
  { value: "dash", displayName: "Dash (—)" },
  { value: "zero", displayName: "Zero (0)" },
  { value: "custom", displayName: "Custom" },
];

/* ---------- enum option sets ---------- */
const THEME_OPTS:    IEnumMember[] = [ { value: "light", displayName: "Light" }, { value: "dark", displayName: "Dark" } ];
const CONTRAST_OPTS: IEnumMember[] = [ { value: "auto", displayName: "Auto" }, { value: "light", displayName: "Light" }, { value: "dark", displayName: "Dark" } ];
// Display label is "Target"; the persisted value stays "goal" so existing reports don't break.
const PRESET_OPTS:   IEnumMember[] = [ { value: "trend", displayName: "Trend" }, { value: "goal", displayName: "Target" }, { value: "headline", displayName: "Headline" } ];
const TREND_OPTS:    IEnumMember[] = [ { value: "area", displayName: "Area" }, { value: "line", displayName: "Line" }, { value: "bars", displayName: "Bars" } ];
// Trend window — cap the sparkline to the last N periods (default Last 12). "all" shows every period delivered.
const TREND_WINDOW_OPTS: IEnumMember[] = [ { value: "last6", displayName: "Last 6" }, { value: "last12", displayName: "Last 12" }, { value: "all", displayName: "All" } ];
// Tooltip period-date format. "auto" follows the Trend-axis field's format string; the rest are explicit
// date formats — the reliable path, since the matrix mapping doesn't hand us the grouping column's format
// the way the categorical one did (measure formats come through fine; the date grouping's doesn't).
const TOOLTIP_DATE_OPTS: IEnumMember[] = [
  { value: "auto", displayName: "Auto (match field)" },
  { value: "MMM yyyy", displayName: "Mar 2025" },
  { value: "MMMM yyyy", displayName: "March 2025" },
  { value: "MMM d, yyyy", displayName: "Mar 14, 2025" },
  { value: "M/d/yyyy", displayName: "3/14/2025" },
  { value: "dd/MM/yyyy", displayName: "14/03/2025" },
  { value: "yyyy-MM", displayName: "2025-03" },
  { value: "yyyy-MM-dd", displayName: "2025-03-14" },
];
const GOALTYPE_OPTS: IEnumMember[] = [ { value: "progress", displayName: "Progress" }, { value: "fixed", displayName: "Fixed" } ];
// Headline aggregation. "total" (default) = the measure's correct DAX grand total; the rest collapse the
// per-period points (Last/First = a single point like the native card / OKViz; Average/Min/Max = stats).
const AGG_OPTS:      IEnumMember[] = [
  { value: "total",   displayName: "Total" },
  { value: "last",    displayName: "Last" },
  { value: "first",   displayName: "First" },
  { value: "average", displayName: "Average" },
  { value: "min",     displayName: "Minimum" },
  { value: "max",     displayName: "Maximum" },
];
const UNITS_OPTS:    IEnumMember[] = [
  { value: "auto", displayName: "Auto" }, { value: "none", displayName: "None" },
  { value: "thousands", displayName: "Thousands" }, { value: "millions", displayName: "Millions" }, { value: "billions", displayName: "Billions" },
];
// Curated font list — a plain enum (so the chosen value is always re-selectable, unlike PBI's
// native picker which omits our bundled webfonts). Embedded Posy fonts first, then standard PBI fonts.
const FONTS = [
  "Space Grotesk", "IBM Plex Mono", "Hanken Grotesk",
  "Arial", "Arial Black", "Calibri", "Cambria", "Candara", "Comic Sans MS", "Consolas",
  "Constantia", "Corbel", "Courier New", "DIN", "Georgia", "Lucida Sans Unicode",
  "Segoe UI", "Tahoma", "Times New Roman", "Trebuchet MS", "Verdana",
];
const FONT_OPTS: IEnumMember[] = FONTS.map(f => ({ value: f, displayName: f }));

export const ICON_KINDS = [
  "bars", "trend", "pulse", "dollar", "coin", "percent", "cart", "package", "user",
  "globe", "target", "flag", "clock", "calendar", "star", "heart", "bolt"
];
const ICON_OPTS: IEnumMember[] = ICON_KINDS
  .map(v => ({ value: v, displayName: v.charAt(0).toUpperCase() + v.slice(1) }));

/* ---------- Card style — Layout / Colors / Border / Shadow collapsible sub-groups ---------- */
class CardStyleCard extends CompositeCard {
  name = "cardStyle";
  displayName = "Card";

  // --- Layout group ---
  showLayoutGallery = new formattingSettings.ToggleSwitch({ name: "showLayoutGallery", displayName: "Show layout gallery", value: false });
  stylePreset = new formattingSettings.ItemDropdown({ name: "stylePreset", displayName: "Layout", items: PRESET_OPTS, value: PRESET_OPTS[0] });
  trendChartType = new formattingSettings.ItemDropdown({ name: "trendChartType", displayName: "Trend chart type", items: TREND_OPTS, value: TREND_OPTS[0] });
  trendWindow = new formattingSettings.ItemDropdown({ name: "trendWindow", displayName: "Trend window", items: TREND_WINDOW_OPTS, value: TREND_WINDOW_OPTS[1] });
  tooltipDateFormat = new formattingSettings.ItemDropdown({ name: "tooltipDateFormat", displayName: "Tooltip date format", items: TOOLTIP_DATE_OPTS, value: TOOLTIP_DATE_OPTS[0] });
  goalTargetType = new formattingSettings.ItemDropdown({ name: "goalTargetType", displayName: "Target type", items: GOALTYPE_OPTS, value: GOALTYPE_OPTS[0] });
  targetLabel = new formattingSettings.TextInput({ name: "targetLabel", displayName: "Target label", value: "Target", placeholder: "Target" });

  // --- Colors group ---
  theme = new formattingSettings.ItemDropdown({ name: "theme", displayName: "Theme", items: THEME_OPTS, value: THEME_OPTS[0] });
  surface = new formattingSettings.ColorPicker({ name: "surface", displayName: "Surface color", value: { value: "#FFFFFF" } });
  lineColor = new formattingSettings.ColorPicker({ name: "lineColor", displayName: "Line color", value: { value: "#5B57E0" } });
  textContrast = new formattingSettings.ItemDropdown({ name: "textContrast", displayName: "Text contrast", items: CONTRAST_OPTS, value: CONTRAST_OPTS[0] });

  // --- Border group ---
  cardBorder = new formattingSettings.ToggleSwitch({ name: "cardBorder", displayName: "Show border", value: true });
  borderColor = new formattingSettings.ColorPicker({ name: "borderColor", displayName: "Color", value: { value: "" } }); // empty = auto (follows the ink ramp)
  borderTransparency = new formattingSettings.Slider({
    name: "borderTransparency", displayName: "Transparency", value: 0,
    options: { minValue: { type: ValidatorType.Min, value: 0 }, maxValue: { type: ValidatorType.Max, value: 100 } }
  });
  cornerRadius = new formattingSettings.Slider({
    name: "cornerRadius", displayName: "Corner radius", value: 22,
    options: { minValue: { type: ValidatorType.Min, value: 8 }, maxValue: { type: ValidatorType.Max, value: 32 } }
  });

  // --- Shadow group ---
  cardShadow = new formattingSettings.ToggleSwitch({ name: "cardShadow", displayName: "Show shadow", value: true });
  shadowColor = new formattingSettings.ColorPicker({ name: "shadowColor", displayName: "Color", value: { value: "" } }); // empty = auto (tone-based)

  layoutGroup = new Group({ name: "cardLayoutGroup", displayName: "Layout", collapsible: true,
    slices: [ this.showLayoutGallery, this.stylePreset, this.trendChartType, this.trendWindow, this.tooltipDateFormat, this.goalTargetType, this.targetLabel ] });
  colorsGroup = new Group({ name: "cardColorsGroup", displayName: "Colors", collapsible: true,
    slices: [ this.theme, this.surface, this.lineColor, this.textContrast ] });
  // Border / Shadow use a native-style HEADER on/off toggle (topLevelSlice) — no separate "Show …" row.
  // Corner radius stays in the Border group (matches native, where rounded corners live under the border).
  borderGroup = new Group({ name: "cardBorderGroup", displayName: "Border", collapsible: true,
    topLevelSlice: this.cardBorder,
    slices: [ this.borderColor, this.borderTransparency, this.cornerRadius ] });
  shadowGroup = new Group({ name: "cardShadowGroup", displayName: "Shadow", collapsible: true,
    topLevelSlice: this.cardShadow,
    slices: [ this.shadowColor ] });

  groups = [ this.layoutGroup, this.colorsGroup, this.borderGroup, this.shadowGroup ];
}

/* ---------- Icons — KPI icon (glyph + size) and Menu icon (size), each its own on/off group ---------- */
class IconCard extends CompositeCard {
  name = "icon";
  displayName = "Icons";

  // --- KPI Icon group ---
  show = new formattingSettings.ToggleSwitch({ name: "show", displayName: "KPI Icon", value: true });
  glyph = new formattingSettings.ItemDropdown({
    name: "glyph", displayName: "Icon", items: ICON_OPTS, value: ICON_OPTS[0]
  });
  kpiIconSize = new formattingSettings.NumUpDown({
    name: "kpiIconSize", displayName: "Size", value: 16,
    options: { minValue: { type: ValidatorType.Min, value: 8 }, maxValue: { type: ValidatorType.Max, value: 40 } }
  });

  // --- Menu Icon group ---
  showMenu = new formattingSettings.ToggleSwitch({ name: "showMenu", displayName: "Menu Icon", value: false });
  menuIconSize = new formattingSettings.NumUpDown({
    name: "menuIconSize", displayName: "Size", value: 16,
    options: { minValue: { type: ValidatorType.Min, value: 8 }, maxValue: { type: ValidatorType.Max, value: 40 } }
  });

  kpiGroup = new Group({
    name: "kpiIconGroup", displayName: "KPI Icon", collapsible: true,
    topLevelSlice: this.show,
    slices: [ this.glyph, this.kpiIconSize ]
  });
  menuGroup = new Group({
    name: "menuIconGroup", displayName: "Menu Icon", collapsible: true,
    topLevelSlice: this.showMenu,
    slices: [ this.menuIconSize ]
  });
  groups = [ this.kpiGroup, this.menuGroup ];
}

/* ---------- Callout value — Value + Label formatting groups ---------- */
class CalloutCard extends CompositeCard {
  name = "callout";
  displayName = "Callout";

  // --- Value group --- (the big number). Order: Font (family/size/B/I/U) → color → units/decimals →
  // blank → wrap. Font family is a curated dropdown (not the native picker) so the embedded Posy
  // fonts stay re-selectable; Bold/Italic/Underline are separate toggles alongside it.
  fontFamily = new formattingSettings.ItemDropdown({
    name: "fontFamily", displayName: "Font", items: FONT_OPTS, value: FONT_OPTS[0] // Space Grotesk
  });
  fontSize = new formattingSettings.NumUpDown({
    name: "fontSize", displayName: "Text size", value: 46, // Trend/Goal default; Headline scales up proportionally
    options: { minValue: { type: ValidatorType.Min, value: 8 }, maxValue: { type: ValidatorType.Max, value: 120 } }
  });
  fontBold = new formattingSettings.ToggleSwitch({ name: "fontBold", displayName: "Bold", value: true });
  fontItalic = new formattingSettings.ToggleSwitch({ name: "fontItalic", displayName: "Italic", value: false });
  fontUnderline = new formattingSettings.ToggleSwitch({ name: "fontUnderline", displayName: "Underline", value: false });
  fontColor = new formattingSettings.ColorPicker({
    name: "fontColor", displayName: "Font color", value: { value: "" } // empty = follow auto-contrast ink
  });
  // Headline aggregation: default Total = the measure's DAX grand total (correct for any measure); the
  // override collapses the per-period points (Last/First/Average/Min/Max). Governs Value, Comparison and
  // Target together so the delta % and % of target stay apples-to-apples.
  valueAggregation = new formattingSettings.ItemDropdown({
    name: "valueAggregation", displayName: "Aggregation", items: AGG_OPTS, value: AGG_OPTS[0], // Total
    description: "Summarizes the headline value, the comparison delta and % of target over the trend (not the trend line itself). Total uses each measure's own DAX aggregate — correct for any measure, including ratios/%; Last/First/Average/Minimum/Maximum roll up the per-period points."
  });
  displayUnits = new formattingSettings.ItemDropdown({
    name: "displayUnits", displayName: "Display units", items: UNITS_OPTS, value: UNITS_OPTS[3] // Millions
  });
  decimalPlaces = new formattingSettings.NumUpDown({
    name: "decimalPlaces", displayName: "Decimal places", value: 2,
    options: { minValue: { type: ValidatorType.Min, value: 0 }, maxValue: { type: ValidatorType.Max, value: 4 } }
  });
  showBlankAs = new formattingSettings.ItemDropdown({
    name: "showBlankAs", displayName: "Show blank as", items: BLANK_OPTS, value: BLANK_OPTS[0] // Blank
  });
  blankText = new formattingSettings.TextInput({
    name: "blankText", displayName: "Custom blank text", value: "", placeholder: ""
  });
  valueTextWrap = new formattingSettings.ToggleSwitch({
    name: "valueTextWrap", displayName: "Text wrap", value: false
  });

  // --- Label group --- (the eyebrow above the number — always shown)
  labelFontFamily = new formattingSettings.ItemDropdown({
    name: "labelFontFamily", displayName: "Font", items: FONT_OPTS, value: FONT_OPTS[1] // IBM Plex Mono
  });
  labelFontSize = new formattingSettings.NumUpDown({
    name: "labelFontSize", displayName: "Text size", value: 12, options: { minValue: { type: ValidatorType.Min, value: 6 }, maxValue: { type: ValidatorType.Max, value: 60 } }
  });
  labelBold = new formattingSettings.ToggleSwitch({ name: "labelBold", displayName: "Bold", value: false });
  labelItalic = new formattingSettings.ToggleSwitch({ name: "labelItalic", displayName: "Italic", value: false });
  labelUnderline = new formattingSettings.ToggleSwitch({ name: "labelUnderline", displayName: "Underline", value: false });
  labelFontColor = new formattingSettings.ColorPicker({
    name: "labelFontColor", displayName: "Font color", value: { value: "" }
  });
  labelTextWrap = new formattingSettings.ToggleSwitch({
    name: "labelTextWrap", displayName: "Text wrap", value: false
  });
  // Editable eyebrow text — defaults to the Value field name (set in syncCalloutLabel), renameable.
  labelText = new formattingSettings.TextInput({
    name: "labelText", displayName: "Label text", value: "", placeholder: ""
  });
  // Hidden tracker: the field the label was derived for (re-derives on field change, preserved on reload).
  labelTextField = new formattingSettings.TextInput({
    name: "labelTextField", displayName: "", value: "", placeholder: ""
  });

  valueGroup = new Group({
    name: "calloutValueGroup", displayName: "Value", collapsible: true,
    slices: [ this.fontFamily, this.fontSize, this.fontBold, this.fontItalic, this.fontUnderline,
              this.fontColor, this.valueAggregation, this.displayUnits, this.decimalPlaces, this.showBlankAs, this.blankText, this.valueTextWrap ]
  });
  labelGroup = new Group({
    name: "calloutLabelGroup", displayName: "Label", collapsible: true,
    slices: [ this.labelText, this.labelFontFamily, this.labelFontSize, this.labelBold, this.labelItalic, this.labelUnderline,
              this.labelFontColor, this.labelTextWrap, this.labelTextField ]
  });
  groups = [ this.valueGroup, this.labelGroup ];
}

/* ---------- Comparison — header toggle + Value + Label formatting groups ---------- */
class DeltaCard extends CompositeCard {
  name = "delta";
  displayName = "Comparison";

  showComparison = new formattingSettings.ToggleSwitch({
    name: "showComparison", displayName: "Show comparison", value: true
  });

  // --- Display group --- (which parts of the comparison row show). Default: Change on, Value off = the
  // "▲ 12.4% vs last month" behaviour. Both = "Last month: $4.29M ▲ 12.4%"; value-only = "Last month: $4.29M".
  showChange = new formattingSettings.ToggleSwitch({ name: "showChange", displayName: "Show change", value: true });
  showComparisonValue = new formattingSettings.ToggleSwitch({ name: "showComparisonValue", displayName: "Show value", value: false });

  // --- Change group --- (the delta ▲/▼ %) — sentiment toggles live here since they drive its color
  lowerIsBetter = new formattingSettings.ToggleSwitch({
    name: "lowerIsBetter", displayName: "Lower is better", value: false
  });
  varianceBackground = new formattingSettings.ToggleSwitch({
    name: "varianceBackground", displayName: "Background", value: false
  });
  // Decimal places for the change readout. Auto = 1 decimal for relative % ("12.4%"); for
  // percentage-point deltas, up to 2 trimmed — extending rather than collapsing tiny movements.
  valueDecimals = new formattingSettings.ItemDropdown({
    name: "valueDecimals", displayName: "Decimal places",
    items: [
      { value: "auto", displayName: "Auto" }, { value: "0", displayName: "0" },
      { value: "1", displayName: "1" }, { value: "2", displayName: "2" },
      { value: "3", displayName: "3" }, { value: "4", displayName: "4" },
    ],
    value: { value: "auto", displayName: "Auto" },
  });
  valueFontFamily = new formattingSettings.ItemDropdown({
    name: "valueFontFamily", displayName: "Font", items: FONT_OPTS, value: FONT_OPTS[0] // Space Grotesk
  });
  valueFontSize = new formattingSettings.NumUpDown({
    name: "valueFontSize", displayName: "Text size", value: 14, options: { minValue: { type: ValidatorType.Min, value: 6 }, maxValue: { type: ValidatorType.Max, value: 60 } }
  });
  valueBold = new formattingSettings.ToggleSwitch({ name: "valueBold", displayName: "Bold", value: false });
  valueItalic = new formattingSettings.ToggleSwitch({ name: "valueItalic", displayName: "Italic", value: false });
  valueUnderline = new formattingSettings.ToggleSwitch({ name: "valueUnderline", displayName: "Underline", value: false });
  valueFontColor = new formattingSettings.ColorPicker({
    name: "valueFontColor", displayName: "Font color", value: { value: "" } // empty = keep sentiment color
  });
  valueShowBlankAs = new formattingSettings.ItemDropdown({
    name: "valueShowBlankAs", displayName: "Show blank as", items: BLANK_OPTS, value: BLANK_OPTS[0]
  });
  valueBlankText = new formattingSettings.TextInput({
    name: "valueBlankText", displayName: "Custom blank text", value: "", placeholder: ""
  });
  valueTextWrap = new formattingSettings.ToggleSwitch({
    name: "valueTextWrap", displayName: "Text wrap", value: false
  });

  // --- Comparison Value group --- (the prior-period absolute value, e.g. "$4.29M") — same options as the
  // Callout value (font/size/B/I/U/color/units/decimals/blank/wrap). Empty color = the secondary-ink default.
  cmpFontFamily = new formattingSettings.ItemDropdown({ name: "cmpFontFamily", displayName: "Font", items: FONT_OPTS, value: FONT_OPTS[0] });
  cmpFontSize = new formattingSettings.NumUpDown({ name: "cmpFontSize", displayName: "Text size", value: 14, options: { minValue: { type: ValidatorType.Min, value: 6 }, maxValue: { type: ValidatorType.Max, value: 60 } } });
  cmpBold = new formattingSettings.ToggleSwitch({ name: "cmpBold", displayName: "Bold", value: false });
  cmpItalic = new formattingSettings.ToggleSwitch({ name: "cmpItalic", displayName: "Italic", value: false });
  cmpUnderline = new formattingSettings.ToggleSwitch({ name: "cmpUnderline", displayName: "Underline", value: false });
  cmpFontColor = new formattingSettings.ColorPicker({ name: "cmpFontColor", displayName: "Font color", value: { value: "" } });
  cmpDisplayUnits = new formattingSettings.ItemDropdown({ name: "cmpDisplayUnits", displayName: "Display units", items: UNITS_OPTS, value: UNITS_OPTS[3] });
  cmpDecimals = new formattingSettings.NumUpDown({ name: "cmpDecimals", displayName: "Decimal places", value: 2, options: { minValue: { type: ValidatorType.Min, value: 0 }, maxValue: { type: ValidatorType.Max, value: 4 } } });
  cmpShowBlankAs = new formattingSettings.ItemDropdown({ name: "cmpShowBlankAs", displayName: "Show blank as", items: BLANK_OPTS, value: BLANK_OPTS[0] });
  cmpBlankText = new formattingSettings.TextInput({ name: "cmpBlankText", displayName: "Custom blank text", value: "", placeholder: "" });
  cmpTextWrap = new formattingSettings.ToggleSwitch({ name: "cmpTextWrap", displayName: "Text wrap", value: false });

  // --- Label group --- (the "vs …" caption)
  comparisonLabel = new formattingSettings.TextInput({
    name: "comparisonLabel", displayName: "Label text", value: "", placeholder: "vs <comparison field>"
  });
  labelFontFamily = new formattingSettings.ItemDropdown({
    name: "labelFontFamily", displayName: "Font", items: FONT_OPTS, value: FONT_OPTS[2] // Hanken Grotesk
  });
  labelFontSize = new formattingSettings.NumUpDown({
    name: "labelFontSize", displayName: "Text size", value: 13, options: { minValue: { type: ValidatorType.Min, value: 6 }, maxValue: { type: ValidatorType.Max, value: 60 } }
  });
  labelBold = new formattingSettings.ToggleSwitch({ name: "labelBold", displayName: "Bold", value: false });
  labelItalic = new formattingSettings.ToggleSwitch({ name: "labelItalic", displayName: "Italic", value: false });
  labelUnderline = new formattingSettings.ToggleSwitch({ name: "labelUnderline", displayName: "Underline", value: false });
  labelFontColor = new formattingSettings.ColorPicker({
    name: "labelFontColor", displayName: "Font color", value: { value: "" }
  });
  labelTextWrap = new formattingSettings.ToggleSwitch({
    name: "labelTextWrap", displayName: "Text wrap", value: false
  });

  // Hidden: tracks which comparison field the current label was derived for, so the label re-derives
  // when the field changes but is preserved on reload.
  comparisonLabelField = new formattingSettings.TextInput({
    name: "comparisonLabelField", displayName: "", value: "", placeholder: ""
  });
  // Hidden: the Value field the label was reconciled against — a Value-field change also re-derives the
  // label (re-exposing the comparison basis so a stale/mismatched comparison is less silent).
  comparisonValueField = new formattingSettings.TextInput({
    name: "comparisonValueField", displayName: "", value: "", placeholder: ""
  });

  topLevelSlice = this.showComparison;
  displayGroup = new Group({
    name: "deltaDisplayGroup", displayName: "Display", collapsible: true,
    slices: [ this.showChange, this.showComparisonValue ]
  });
  valueGroup = new Group({
    name: "deltaValueGroup", displayName: "Change", collapsible: true,
    slices: [ this.valueFontFamily, this.valueFontSize, this.valueBold, this.valueItalic, this.valueUnderline,
              this.valueFontColor, this.valueDecimals, this.valueShowBlankAs,
              this.valueBlankText, this.valueTextWrap, this.varianceBackground, this.lowerIsBetter ]
  });
  comparisonValueGroup = new Group({
    name: "deltaCompareValueGroup", displayName: "Value", collapsible: true,
    slices: [ this.cmpFontFamily, this.cmpFontSize, this.cmpBold, this.cmpItalic, this.cmpUnderline,
              this.cmpFontColor, this.cmpDisplayUnits, this.cmpDecimals, this.cmpShowBlankAs, this.cmpBlankText, this.cmpTextWrap ]
  });
  labelGroup = new Group({
    name: "deltaLabelGroup", displayName: "Label", collapsible: true,
    slices: [ this.comparisonLabel, this.labelFontFamily, this.labelFontSize, this.labelBold, this.labelItalic,
              this.labelUnderline, this.labelFontColor, this.labelTextWrap, this.comparisonLabelField, this.comparisonValueField ]
  });
  groups = [ this.displayGroup, this.valueGroup, this.comparisonValueGroup, this.labelGroup ];
}

/* ---------- Conditional formatting — Enable + "Edit rules" launcher only ----------
 * The whole rule config (per-mode rule lists, trend colors, apply-to) is persisted as JSON in `config`
 * (hidden) and edited entirely in the modal dialog; nothing rule-specific lives in the pane. The format
 * pane can't host a variable rule list, so editing is dialog-only. See model/cfConfig.ts + the dialog. */
class ConditionalFormattingCard extends Card {
  name = "conditionalFormatting";
  displayName = "Conditional formatting";

  enable = new formattingSettings.ToggleSwitch({ name: "enable", displayName: "Enable", value: false });
  // Launcher: flip-to-open the modal editor (visual.ts), persisted back to false on close. Shown only where
  // the host allows modal dialogs AND CF is enabled (applyPaneVisibility).
  showEditor = new formattingSettings.ToggleSwitch({ name: "showEditor", displayName: "Edit rules", value: false });
  // Hidden: the entire rule config serialized as JSON, written by the dialog via persistProperties.
  config = new formattingSettings.TextInput({ name: "config", displayName: "", value: "", placeholder: "" });

  topLevelSlice = this.enable;
  slices = [ this.showEditor, this.config ];
}

/* ---------- Advanced — occasional / power-user overrides (custom fonts; room to grow) ---------- */
// A typed font name overrides that element's curated-dropdown choice; empty = use the dropdown. The
// font must be installed where the report renders (same caveat as native PBI theme fonts) — only our
// three embedded Posy fonts are guaranteed everywhere. Kept out of the everyday Callout/Comparison flow.
const CF_FONT_PLACEHOLDER = "e.g. Gotham (must be installed)";
const CF_FONT_DESC = "Overrides the dropdown. Renders only where the font is installed; viewers without it see the fallback.";

class AdvancedCard extends CompositeCard {
  name = "advanced";
  displayName = "Advanced";

  customFontsEnable = new formattingSettings.ToggleSwitch({ name: "customFontsEnable", displayName: "Custom fonts", value: false });
  customFontsNote = new formattingSettings.ReadOnlyText({
    name: "customFontsNote", displayName: "",
    value: "Power BI doesn't embed fonts — a custom font shows only where it's installed on the viewer's device; otherwise the card falls back to a default."
  });
  calloutValueFont = new formattingSettings.TextInput({ name: "calloutValueFont", displayName: "Callout value", value: "", placeholder: CF_FONT_PLACEHOLDER, description: CF_FONT_DESC });
  calloutLabelFont = new formattingSettings.TextInput({ name: "calloutLabelFont", displayName: "Callout label", value: "", placeholder: CF_FONT_PLACEHOLDER, description: CF_FONT_DESC });
  comparisonValueFont = new formattingSettings.TextInput({ name: "comparisonValueFont", displayName: "Comparison value", value: "", placeholder: CF_FONT_PLACEHOLDER, description: CF_FONT_DESC });
  comparisonLabelFont = new formattingSettings.TextInput({ name: "comparisonLabelFont", displayName: "Comparison label", value: "", placeholder: CF_FONT_PLACEHOLDER, description: CF_FONT_DESC });

  fontsGroup = new Group({
    name: "advancedFontsGroup", displayName: "Custom fonts", collapsible: true,
    topLevelSlice: this.customFontsEnable,
    slices: [ this.customFontsNote, this.calloutValueFont, this.calloutLabelFont, this.comparisonValueFont, this.comparisonLabelFont ]
  });
  groups = [ this.fontsGroup ];
}

export class VisualFormattingSettingsModel extends Model {
  cardStyle = new CardStyleCard();
  callout = new CalloutCard();
  icon = new IconCard();
  delta = new DeltaCard();
  conditionalFormatting = new ConditionalFormattingCard();
  advanced = new AdvancedCard();
  cards = [ this.cardStyle, this.callout, this.icon, this.delta, this.conditionalFormatting, this.advanced ];
}
