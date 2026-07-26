# KPI Card by Posy — AI Authoring Reference

This document teaches an AI agent (Claude Code or similar) to author Power BI reports that use
**KPI Card by Posy** by writing **PBIR** files (`definition\pages\<page>\visuals\<visual>\visual.json`)
directly. It is the machine-usable contract for the visual: data bindings, the full formatting-property
vocabulary, the conditional-formatting JSON grammar, and the visual's automatic behaviors.

- **visualType (GUID):** `posyKpiCard56510B2AA51B481D9AC80E9A4662B5DB`
- **Visual name:** KPI Card by Posy · **Package version:** 1.0.0.0 · **API:** 5.11.0
- **Distribution:** AppSource (public custom visual — Desktop auto-downloads it when referenced).
  Until the AppSource listing is live, start from a seed PBIP that already has the private `.pbiviz`
  registered (PBIR's `report.json` resource registration is not externally editable during preview).
- **Licensing:** transactable visual. Without an assigned license (or trial) the card renders blocked
  with Power BI's "license required" overlay. In environments that can't check licenses
  (publish-to-web, embedded, Report Server, PDF/PPT export) it renders normally.

---

## 1. Data contract

Five data roles, bound through a **matrix** data-view mapping (Trend axis on rows, measures on values):

| Role (internal) | Display name | Kind | Cardinality | Purpose |
|---|---|---|---|---|
| `value` | Value | Measure | **required, exactly 1** | The headline number |
| `trend` | Trend axis | Grouping | max 1 | Period column (usually a date) that the sparkline plots `value` over |
| `comparison` | Comparison | Measure | max 1 | Reference value for the ▲/▼ delta (`(value − comparison) / comparison`) |
| `target` | Target | Measure | max 1 | Goal for the Target layout and "% of target" |
| `tooltips` | Tooltips | Measure | unlimited | Extra measures shown in the hover tooltip |

What each binding unlocks: no `trend` → no sparkline (Trend layout falls back to value-only rendering);
no `comparison` → no delta row; no `target` → Target layout has no bar. The empty landing state shows
only when **`value` is unbound**.

**Aggregation semantics (important for correctness):** the headline is the measure's **DAX grand
total** (delivered via matrix row subtotals), *not* a client-side sum of the plotted points — so
non-additive measures (ratios, averages, distinct counts) are correct by default. The sparkline plots
the per-period leaves. `callout.valueAggregation` can override the headline to Last/First/Average/
Min/Max **of the per-period points** (applies to value + comparison + target together; the sparkline
is never affected).

The trend axis arrives as a string/number in the matrix mapping; the visual coerces it back to a Date
for label formatting. If the author's field format doesn't come through, set
`cardStyle.tooltipDateFormat` explicitly.

---

## 2. Layout recipes

`cardStyle.stylePreset` selects the layout. Sub-type properties only apply to their layout (harmless
but pointless elsewhere).

### Trend (`"trend"` — default)
Value + delta + sparkline. Bind `value` (+ `trend`, usually `comparison`).
Relevant: `trendChartType` (`area`|`line`|`bars`), `trendWindow` (`last6`|`last12`|`all`, default
`last12` — windows the sparkline only, never the headline), `tooltipDateFormat`.

### Target (`"goal"` — **persisted value is `goal`**, UI label is "Target")
Progress toward a goal. Bind `value` + `target`.
Relevant: `goalTargetType` — `progress` (fill bar + "% to goal" foot) or `fixed` (bullet bar +
over/under readout); `targetLabel` (text, default `"Target"`).
**Runtime default:** on a fresh Target card the comparison row defaults **off** (`delta.showComparison`
is forced false unless the author/agent has explicitly persisted it). Set it explicitly if you want a
delta on a Target card.

### Headline (`"headline"`)
The number is the whole story. Bind `value` (+ optional `comparison`).
The callout renders proportionally larger (default 46px scales to ≈56px on Headline).

---

## 3. Formatting property reference

PBIR persists these under `objects.<objectName>` in `visual.json`. Only set what you want to differ
from the default — unset properties follow defaults (and the visual's automatic behaviors).

### `cardStyle` — Card (layout · colors · border · shadow)

| Property | Type | Values / range | Default | Notes |
|---|---|---|---|---|
| `stylePreset` | enum | `trend` \| `goal` \| `headline` | `trend` | Layout selector |
| `trendChartType` | enum | `area` \| `line` \| `bars` | `area` | Trend layout only |
| `trendWindow` | enum | `last6` \| `last12` \| `all` | `last12` | Sparkline window; headline unaffected |
| `tooltipDateFormat` | enum | `auto`, `MMM yyyy`, `MMMM yyyy`, `MMM d, yyyy`, `M/d/yyyy`, `dd/MM/yyyy`, `yyyy-MM`, `yyyy-MM-dd` | `auto` | Trend tooltip period format |
| `goalTargetType` | enum | `progress` \| `fixed` | `progress` | Target layout only |
| `targetLabel` | text | any | `"Target"` | Foot label on the fixed bullet |
| `theme` | enum | `light` \| `dark` | `light` | Sets the default surface + ink family |
| `surface` | fill | hex color | `#FFFFFF` | Card background; auto-contrast measures it and flips ink |
| `lineColor` | fill | hex color | `#5B57E0` | Trend line / target bar accent |
| `textContrast` | enum | `auto` \| `light` \| `dark` | `auto` | Force the ink ramp if auto-contrast must be overridden |
| `cardBorder` | bool | | `true` | 1px border |
| `borderColor` | fill | hex or `""` | `""` (auto) | Empty follows the ink ramp |
| `borderTransparency` | number | 0–100 | `0` | Multiplies the border's base alpha |
| `cornerRadius` | number | 8–32 | `22` | Applied even when the border is off |
| `cardShadow` | bool | | `true` | Soft shadow inside the visual rect |
| `shadowColor` | fill | hex or `""` | `""` (auto) | Empty = tone-based default |
| `showLayoutGallery` | bool | | `false` | **Do not set** — opens an interactive picker + focus mode |

### `icon` — Icons

| Property | Type | Values | Default | Notes |
|---|---|---|---|---|
| `show` | bool | | `true` | KPI icon beside the label |
| `glyph` | enum | `bars` `trend` `pulse` `dollar` `coin` `percent` `cart` `package` `user` `globe` `target` `flag` `clock` `calendar` `star` `heart` `bolt` | `bars` | Pick to match the metric's meaning |
| `kpiIconSize` | number | 8–40 | `16` | |
| `showMenu` | bool | | `false` | Decorative `···` mark (inert) |
| `menuIconSize` | number | 8–40 | `16` | |

### `callout` — the value + its label (eyebrow)

Value element:

| Property | Type | Values | Default | Notes |
|---|---|---|---|---|
| `valueAggregation` | enum | `total` \| `last` \| `first` \| `average` \| `min` \| `max` | `total` | `total` = DAX grand total (correct for non-additive measures) |
| `displayUnits` | enum | `auto` \| `none` \| `thousands` \| `millions` \| `billions` | `millions` | Currency symbol/locale still come from the measure's format string |
| `decimalPlaces` | number | 0–4 | `2` | |
| `fontFamily` | enum | `Space Grotesk`, `IBM Plex Mono`, `Hanken Grotesk`, + 18 standard fonts | `Space Grotesk` | The 3 Posy fonts are embedded (render everywhere) |
| `fontSize` | number | 8–120 | `46` | Headline layout scales this ×56/46 |
| `fontBold` / `fontItalic` / `fontUnderline` | bool | | `true` / `false` / `false` | Bold on = weight 700 |
| `fontColor` | fill | hex or `""` | `""` | Empty follows auto-contrast ink — **prefer leaving unset** |
| `showBlankAs` | enum | `blank` \| `dash` \| `zero` \| `custom` | `blank` | `blankText` holds the custom string |
| `blankText` | text | any | `""` | Only used with `custom` |
| `valueTextWrap` | bool | | `false` | |

Label (eyebrow) element: `labelText` (text — defaults to the Value field's display name, auto-resyncs
on field change), `labelFontFamily` (default `IBM Plex Mono`), `labelFontSize` (default `12`),
`labelBold`/`labelItalic`/`labelUnderline` (false), `labelFontColor` (`""` = auto), `labelTextWrap`
(false). The label renders uppercase with wide tracking by design.

### `delta` — Comparison row

| Property | Type | Values | Default | Notes |
|---|---|---|---|---|
| `showComparison` | bool | | `true` (runtime `false` on fresh Target cards) | Master toggle |
| `showChange` | bool | | `true` | The ▲/▼ percent |
| `showComparisonValue` | bool | | `false` | The comparison's absolute value. Both on → `"Last month: $4.29M ▲ 12.4%"`; change-only → `"▲ 12.4% vs last month"` |
| `lowerIsBetter` | bool | | `false` | Inverts delta sentiment (cost/error metrics) |
| `varianceBackground` | bool | | `false` | Tinted pill behind the delta |
| `comparisonLabel` | text | any | `""` | Defaults to `"vs <comparison field name>"`, auto-resyncs on field change |

Styling triplets (same pattern as callout): `value*` styles the ▲/▼ change (font default Space
Grotesk 14, color `""` = sentiment green/red); `cmp*` styles the comparison value (`cmpDisplayUnits`
default `millions`, `cmpDecimals` 2, `cmpShowBlankAs`/`cmpBlankText`); `label*` styles the caption
(font default Hanken Grotesk 13). Each has Bold/Italic/Underline (false) + FontColor (`""` = auto) +
TextWrap (false).

### `conditionalFormatting` — rule-driven recoloring

| Property | Type | Default | Notes |
|---|---|---|---|
| `enable` | bool | `false` | Master switch — without it the config is ignored |
| `config` | text (JSON) | `""` | The full rule model — grammar below |
| `showEditor` | bool | `false` | **Do not set** — opens the modal editor in Desktop |

CF recolors **only the trend line (Trend layout) and/or the target bar (Target layout)** — never the
callout value. Headline has no CF-colorable element.

### `advanced` — Custom fonts

`customFontsEnable` (bool, default false) gates four free-text overrides: `calloutValueFont`,
`calloutLabelFont`, `comparisonValueFont`, `comparisonLabelFont`. A font named here overrides that
element's dropdown, but renders only where installed — only the 3 embedded Posy fonts are guaranteed.
`customFontsNote` is a read-only pane note — **do not set**.

---

## 4. Reserved properties — never write these

| Property | Why |
|---|---|
| `conditionalFormatting.showEditor` | Dialog trigger — persisting `true` would pop the editor on load. |
| `cardStyle.showLayoutGallery` | Opens the interactive gallery + focus mode. |
| `advanced.customFontsNote` | Read-only pane text. |
| the whole `subTotals` object | Must stay unset so the matrix row grand total defaults ON — the headline's correctness depends on it. |

**Label sync trackers — write in pairs or not at all.** `callout.labelTextField`,
`delta.comparisonLabelField`, and `delta.comparisonValueField` are the visual's sync trackers: on load
it compares each tracker to the currently bound field name and, on mismatch, **re-derives the label and
overwrites it**. Verified from Desktop's own serialization, the correct patterns are:

- *Auto labels (recommended):* omit `labelText`/`comparisonLabel` **and** all three trackers — the
  visual derives "vs &lt;field&gt;" / the value field name itself.
- *Custom label:* set the label **and** its tracker together, tracker = the bound field's display name
  (e.g. `comparisonLabel: 'vs last year'` + `comparisonLabelField: 'Revenue PY'` +
  `comparisonValueField: 'Revenue'`). A custom label without its tracker gets clobbered on first load.

---

## 5. Conditional-formatting `config` grammar

`conditionalFormatting.config` is a JSON **string** (serialized object). Shape:

```json
{
  "basedOn": "value",
  "rules": {
    "value":  [ { "op": ">", "val": "3M", "val2": "", "color": "#0E9F6E" } ],
    "pct":    [],
    "change": []
  },
  "trend": { "dir": "high", "good": "#0E9F6E", "neutral": "#E0A21E", "bad": "#E0484C" },
  "applyTrendLine": true,
  "applyTargetBar": false
}
```

- `basedOn`: `"value"` (raw headline value) · `"pct"` (value/target × 100) · `"change"` (delta % —
  raw signed, **not** inverted by `lowerIsBetter`) · `"trend"` (direction of the windowed sparkline:
  last point vs first).
- Threshold modes (`value`/`pct`/`change`) evaluate **only the active mode's list**, max 4 rules,
  **first match wins**. Ops: `">"`, `"≥"`, `"<"`, `"≤"`, `"="`, `"between"` (uses `val2`),
  `"is not blank"`. `val`/`val2` are strings; they accept plain numbers, grouped (`"3,000,000"`), or
  magnitude suffixes (`"3K"`, `"3M"`, `"3B"`, `"3T"`) and are compared against the **raw** measure
  value (display units never enter into it). Unparseable value → that rule is skipped.
- `trend` mode ignores the rules lists: direction + `dir` sentiment (`high` = up is good) picks
  `good`/`neutral`/`bad` (flat → neutral). Needs a bound Trend axis with ≥ 2 points.
- `applyTrendLine` / `applyTargetBar` both default **false** — a config with rules but neither apply
  flag recolors nothing. Set the one matching the card's layout.
- Remember `enable: true` alongside the config.

---

## 6. Automatic behaviors an agent must know

1. **Auto-contrast:** the visual measures the surface's luminance and flips the entire ink ramp
   (WCAG-aware). Dark surfaces get light ink and a lifted accent automatically — so **don't** set
   font colors when styling a dark card; set `surface`/`theme` and let the ramp work.
2. **Labels self-derive:** the callout eyebrow defaults to the Value field's display name; the
   comparison caption defaults to `"vs <Comparison field name>"`. Both re-derive when fields change.
   Only set `labelText`/`comparisonLabel` for a deliberate rename.
3. **Currency/locale come from the measure**, not the visual: format the measure (`$#,0` etc.) in the
   semantic model; the visual applies display units/decimals on top (billions abbreviate as `B`).
4. **The host title is suppressed** (`suppressDefaultTitle`) — the card draws its own eyebrow. Don't
   add a redundant text-box title above it.
5. **The card is intentionally inert** — no cross-filtering. Place one metric per card; build KPI
   strips from several cards.
6. **Recommended sizing:** the design-reference card is ~392×260px (Trend). Cards flex, but keep
   roughly that aspect for the intended look; the callout font size is fixed (no auto-shrink), so
   very small tiles need a smaller `fontSize`.

---

## 7. PBIR `visual.json` — verified encoding + canonical example

Extracted from the sample report saved in PBIR format (visualContainer schema **2.11.0**); every
pattern below is Desktop's own serialization of this visual.

> **Round-trip verified (2026-07-25):** a six-card torture page exercising the full property surface
> (every object, every widget type, both CF threshold modes, `between` + magnitude suffixes + the `≥`
> operator, label-tracker pairs, custom fonts) was generated externally per this document, opened in
> Power BI Desktop with **zero blocking errors and all formatting rendering correctly**, then re-saved.
> Desktop's re-serialization changed **no encodings** — the only diffs were the visual persisting
> auto-derived label + tracker pairs where they'd been omitted (the §6 self-derive behavior). Expect
> those additions on re-save; they're harmless. Custom labels written with their trackers were
> preserved untouched. Test harness: `ai-authoring/encoding-test/generate-torture-page.py`
> (+ `baseline-generated/` for diffing), kept alongside the PBIR ground-truth corpus.

### Literal encoding rules

| Kind | Encoding | Example |
|---|---|---|
| enum / text | single-quoted string inside `Value` | `{"expr": {"Literal": {"Value": "'goal'"}}}` |
| number | `D` suffix | `{"expr": {"Literal": {"Value": "2D"}}}` |
| boolean | bare | `{"expr": {"Literal": {"Value": "true"}}}` |
| fill color | `solid.color` wrapper (note: **not** under a top-level `expr`) | `{"solid": {"color": {"expr": {"Literal": {"Value": "'#1C71A3'"}}}}}` |
| CF `config` | JSON serialized into a single-quoted string literal | see below |

Objects are arrays-of-one: `objects.<objectName>[0].properties.<prop>`.

### Canonical Trend card (bindings + common properties)

```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.11.0/schema.json",
  "name": "<20-char-unique-id>",
  "position": { "x": 112.7, "y": 169, "z": 0, "height": 315, "width": 408, "tabOrder": 0 },
  "visual": {
    "visualType": "posyKpiCard56510B2AA51B481D9AC80E9A4662B5DB",
    "query": {
      "queryState": {
        "value": {
          "projections": [{
            "field": { "Measure": { "Expression": { "SourceRef": { "Entity": "_Metrics" } }, "Property": "Revenue" } },
            "queryRef": "_Metrics.Revenue", "nativeQueryRef": "Revenue"
          }]
        },
        "trend": {
          "projections": [{
            "field": { "Column": { "Expression": { "SourceRef": { "Entity": "Dim_Date" } }, "Property": "MonthYear" } },
            "queryRef": "Dim_Date.MonthYear", "nativeQueryRef": "MonthYear"
          }]
        },
        "comparison": {
          "projections": [{
            "field": { "Measure": { "Expression": { "SourceRef": { "Entity": "_Metrics" } }, "Property": "Revenue PY" } },
            "queryRef": "_Metrics.Revenue PY", "nativeQueryRef": "Revenue PY"
          }]
        },
        "target": {
          "projections": [{
            "field": { "Measure": { "Expression": { "SourceRef": { "Entity": "_Metrics" } }, "Property": "Revenue Target" } },
            "queryRef": "_Metrics.Revenue Target", "nativeQueryRef": "Revenue Target"
          }]
        }
      },
      "sortDefinition": {
        "sort": [{
          "field": { "Column": { "Expression": { "SourceRef": { "Entity": "Dim_Date" } }, "Property": "MonthYear" } },
          "direction": "Ascending"
        }],
        "isDefaultSort": true
      }
    },
    "objects": {
      "callout": [{ "properties": {
        "displayUnits": { "expr": { "Literal": { "Value": "'millions'" } } },
        "decimalPlaces": { "expr": { "Literal": { "Value": "2D" } } }
      } }],
      "delta": [{ "properties": {
        "comparisonLabel": { "expr": { "Literal": { "Value": "'vs last year'" } } },
        "comparisonLabelField": { "expr": { "Literal": { "Value": "'Revenue PY'" } } },
        "comparisonValueField": { "expr": { "Literal": { "Value": "'Revenue'" } } }
      } }]
    },
    "visualContainerObjects": {
      "title": [{ "properties": { "show": { "expr": { "Literal": { "Value": "false" } } } } }],
      "background": [{ "properties": { "show": { "expr": { "Literal": { "Value": "false" } } } } }],
      "border": [{ "properties": { "show": { "expr": { "Literal": { "Value": "false" } } } } }]
    },
    "drillFilterOtherVisuals": true
  }
}
```

Notes:
- **Container hygiene:** always turn off the container `title`, `background`, and `border` in
  `visualContainerObjects` — the card draws its own chrome (this matches the visual's own guidance).
- The trend column drives the sort (`Ascending`, `isDefaultSort: true`) so the sparkline reads
  left-to-right chronologically.
- A projection may carry the measure's `format` string (Desktop adds it); optional when authoring.
- The role keys in `queryState` are the internal role names from §1 verbatim.

### Layout variants (objects deltas from the canonical card)

- **Trend line/bars:** `"cardStyle": [{ "properties": { "trendChartType": { "expr": { "Literal": { "Value": "'line'" } } } } }]` (or `'bars'`).
- **Target progress:** `stylePreset` → `'goal'` (target measure bound; `goalTargetType` defaults to `progress`).
- **Target fixed:** `stylePreset` → `'goal'`, `goalTargetType` → `'fixed'`.
- **Headline:** `stylePreset` → `'headline'` (trend/target bindings unnecessary).
- **Dark theme:** `"theme": { "expr": { "Literal": { "Value": "'dark'" } } }` — no font colors needed (auto-contrast).
- **Custom surface:** `"surface": { "solid": { "color": { "expr": { "Literal": { "Value": "'#EAF6F8'" } } } } }`.

### Conditional formatting example (trend-direction, lower-is-better metric)

```json
"conditionalFormatting": [{ "properties": {
  "enable": { "expr": { "Literal": { "Value": "true" } } },
  "config": { "expr": { "Literal": {
    "Value": "'{\"basedOn\":\"trend\",\"rules\":{\"value\":[],\"pct\":[],\"change\":[]},\"trend\":{\"dir\":\"low\",\"good\":\"#0E9F6E\",\"neutral\":\"#E0A21E\",\"bad\":\"#E0484C\"},\"applyTrendLine\":true,\"applyTargetBar\":false}'"
  } } }
} }]
```

---

## 8. Validation workflow

1. **Schema-validate** each written file against its `$schema` (Microsoft publishes all PBIR schemas
   at `github.com/microsoft/json-schemas` → `fabric/item/report/definition`).
2. **Open the PBIP in Power BI Desktop** — blocking errors name the offending file; non-blocking ones
   auto-fix. Fix blocking errors in-place and reopen.
3. **Visual review:** render each page, screenshot, and compare against the intent (layout, binding,
   formatting, CF colors). The tips in §6 catch the common "technically valid, visually wrong" cases.
