---
name: posy-report-builder
description: Build or extend a Power BI report (PBIP/PBIR format) using KPI Card by Posy from natural-language intent — read the semantic model, choose layouts, bind fields, generate visual.json files, assemble pages, and validate. Use when the user asks to create KPI cards, a KPI strip/dashboard, or configure Posy visuals in a Power BI report.
---

# Posy Report Builder

Author Power BI reports with **KPI Card by Posy** by writing PBIR files directly. The complete
visual contract — data roles, property vocabulary, CF grammar, verified JSON encodings — is in
[docs/AI-AUTHORING.md](../../../docs/AI-AUTHORING.md). Read it before generating anything; this
skill is the workflow, that document is the vocabulary.

## Prerequisites

- A **PBIP project saved in PBIR format** (a `*.Report\definition\` folder exists). If the user has
  only a `.pbix`: have them enable *Options → Preview features → "Store reports using enhanced
  metadata format (PBIR)"*, restart Desktop, and Save As → `.pbip`.
- **The visual available to the report.** Until KPI Card is live on AppSource, the report must
  descend from a seed PBIP whose `CustomVisuals\posyKpiCard…\` folder is already registered (copy an
  existing Posy report project). Once the AppSource listing is live, reference it as a public custom
  visual instead — Desktop auto-downloads by GUID.
- Note the visual is **licensed**: on machines without a license/trial the card renders with a
  "license required" overlay. That's expected during authoring without a license — layout work is
  still reviewable.

## Workflow

### 1. Read the semantic model
Parse `*.SemanticModel\definition\` (TMDL text): collect tables, **measures** (with `formatString` —
this drives the card's currency/percent rendering), and date tables/columns. Identify:
- KPI candidates: measures the user names, or headline-worthy measures (revenue, users, rates).
- The **trend axis**: a month/date column from the date dimension (e.g. `Dim_Date.MonthYear`). Check
  for a sort-by column; the visual plots values in the sorted order.
- Support measures by naming convention: `<X> PY` / `<X> Last Month` → comparison; `<X> Target` /
  `<X> Goal` / `<X> Plan` → target. Confirm pairings with the user when ambiguous — binding the
  wrong comparison silently computes a meaningless delta.

### 2. Choose a layout per KPI
- Has a meaningful **target** → `goal` (Target) layout — `progress` for cumulative goals, `fixed`
  for benchmarks. Note: comparison row defaults OFF on Target cards; set it explicitly if wanted.
- Time-series metric where the **shape of change** matters → `trend` (default `area`; `bars` for
  discrete periods, `line` for a cleaner look).
- Single number that stands alone → `headline`.
- Cost/error/rate-down-is-good metrics → set `delta.lowerIsBetter: true` (and CF trend `dir: "low"`).

### 3. Generate visuals
For each card, create `definition\pages\<pageId>\visuals\<visualId>\visual.json` from the canonical
template in AI-AUTHORING.md §7:
- `name`/folder: a fresh 20-char lowercase hex id (must be unique in the report).
- Bind roles per §1 of the reference; sort by the trend column ascending (`isDefaultSort: true`).
- Only set properties that differ from defaults. **Never** set the reserved properties (§4), and
  follow the label-tracker pairing rule when customizing labels.
- Always include the container hygiene block (`title`/`background`/`border` off).
- Styling: prefer `theme`/`surface` + auto-contrast over explicit font colors; keep the 3-family
  type system (don't override fonts without a reason).

### 4. Assemble pages
- Add each visual's page folder + `page.json` (name, displayName, width/height — default canvas
  1280×720), and register page order in `pages.json`.
- KPI strip math: cards read best near the reference proportions (~408×315 or wider ~392×260).
  For an N-card strip on a 1280 canvas: margin 40, gutter 24, width = (1280 − 80 − 24(N−1))/N.
  Align tops; equal heights; `tabOrder` left-to-right (×1000 steps, matching Desktop convention).

### 5. Validate — three gates, in order
1. **Schema:** every generated file validates against the `$schema` URL in its header (Microsoft
   publishes all PBIR schemas; offline check if the schemas are cached in the workspace).
2. **Lint (Posy rules):** no reserved properties; trackers paired; enum values from the vocabulary
   tables; CF `config` parses as JSON and its `applyTrendLine`/`applyTargetBar` matches the card's
   layout; `enable: true` present when a config is set.
3. **Desktop:** have the user open the `.pbip` — blocking errors name the offending file (fix
   in-place, reopen); then review rendered pages (screenshot) against intent: right measure, right
   layout, delta direction/sentiment, readable contrast, no clipped callout (lower `fontSize` on
   small tiles — the value never auto-shrinks).

## Hard rules

- One metric per card. Strips of several cards, never multi-metric cards.
- The card doesn't cross-filter — don't promise interactions it won't do.
- Currency/locale come from the **measure's format string** in the model — fix formatting there,
  not with card properties.
- Never edit `report.json` resource registrations, `.platform`, or `SecurityBindings`-adjacent
  files; PBIR resource registration is Desktop-owned during preview.
