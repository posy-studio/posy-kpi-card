# KPI Card by Posy — AI Design Guide

[AI-AUTHORING.md](AI-AUTHORING.md) is the *schema* — what an agent **can** write.
This document is the *taste* — what an agent **should** write. Posy's promise is design-led,
modern visuals: AI-generated reports must look like Posy marketing material by default, not like a
settings dump. Every rule here derives from the design team's own sample report and design system.

**The prime directive: the defaults ARE the design.** The card ships pixel-tuned — Space Grotesk
value, mono eyebrow, auto-contrast ink, indigo accent, calibrated chrome. The strongest-looking card
is one where you changed almost nothing. Formatting properties exist for deliberate, single-purpose
deviations — not for exploration.

---

## 1. Card sizing — layout-aware, always

Canonical dimensions (from the design team's sample, page canvas 1280×800). **Never give different
layouts the same height.**

| Layout | Canonical W×H | Minimum | Aspect | Why |
|---|---|---|---|---|
| Trend | **408 × 315** | 360 × 280 | ~1.3:1 | The sparkline needs vertical room |
| Target | **408 × 266** | 360 × 240 | ~1.5:1 | Bar + foot, no chart body |
| Headline | **416 × 189** | 320 × 170 | ~2.2:1 | The number is the whole card |
| Headline w/ comparison value modes | 360 × 212 | 320 × 190 | ~1.7:1 | Extra comparison row |

Scaling: cards may scale ±15% from canonical while keeping aspect. Below minimum height, reduce
`callout.fontSize` (height < 220 → 36–40) — the value never auto-shrinks.

## 2. Grid & strip system

- Page margin **40px**, gutter **24px**, canvas 1280×800 (or 1280×720).
- A row of same-layout cards: identical sizes, tops aligned. A **KPI strip is one layout family** —
  don't alternate Trend/Headline/Trend in a row.
- Mixed layouts belong in **separate rows** (hero Trend row, then a Headline strip below), tops
  aligned within each row.
- N-across width: `(canvasW − 80 − 24(N−1)) / N`. Prefer 3-across at 1280 (≈ 384 — right at
  canonical width); 4-across only for Headline strips (≈ 281 wide — reduce `fontSize` to ~36).
- Don't fill every pixel. The sample pages breathe; whitespace is part of the look.

## 3. Curated looks — start here, always

Generate from one of these recipes. Free-form property mixing is an escape hatch for explicit user
requests, never the default.

**Posy Light (default).** Change nothing. Bind fields, set the layout, size per §1. This is the
flagship look.

**Posy Dark.** `theme: 'dark'` — and *stop*. Auto-contrast handles every color. Never combine with
font colors or custom surfaces.

**Brand accent.** ONE change: `lineColor` from the approved accent list —
`#5B57E0` (default indigo) · `#1C71A3` teal-blue · `#6349C4` violet · `#BA2C67` magenta ·
`#0E9F6E` green · `#E8663D` orange. Optionally pair a *matching pale tint* surface (e.g. `#1C71A3`
line + `#EAF6F8` surface). Never pair an accent with an unrelated tint.

**Status card.** Conditional formatting with the DS status colors (`#0E9F6E` / `#E0A21E` /
`#E0484C`), `applyTrendLine`/`applyTargetBar` per layout. Trend-direction basis for "is it moving
the right way," `pct` basis for goal health. Colors stay the DS trio unless the user insists.

## 4. Restraint rules (the ban list)

1. **Never set font families or font colors per element.** The three-family type system (Space
   Grotesk numerals / IBM Plex Mono labels / Hanken Grotesk prose) and auto-contrast ink *are* the
   brand. `advanced` custom fonts only on an explicit "use our corporate font" request.
2. **Never set Bold/Italic/Underline** on anything. The weight hierarchy is designed in.
3. **Max one accent decision per card** (a line color OR a surface+line pair — not several).
4. `varianceBackground` only on light surfaces with the default delta color.
5. One trend chart type per strip; one icon style per report. Icons: choose glyphs semantically
   (`dollar` revenue · `user` audiences · `percent` rates · `cart` orders · `target` goals), keep
   size 16.
6. Leave `showMenu` off. Leave `showBlankAs` at `blank` or use `dash`; avoid `zero` (masks data
   gaps) unless the user asks.
7. Match `displayUnits` to the measure's magnitude — `millions` for revenue-scale, `thousands` for
   tens-of-thousands, `none` for counts under 10K and percentages (with `auto` as the safe
   fallback). A card reading "0.01M" is a design failure (and a binding-scale smell — see §5).
8. Respect per-layout property scope: no trend properties on Headline cards, no `goalTargetType`
   without a target.

## 5. Design-QA gate (add to validation)

After the report opens in Desktop, review a screenshot against:

- [ ] Heights differ by layout per §1 (a Headline card is never Trend-height)
- [ ] Rows aligned, gutters even, margins ≥ 40
- [ ] No value reads awkwardly ("0.01M", "10162" for money, clipped digits)
- [ ] Value/target and value/comparison pairs are the same measure family and magnitude
- [ ] At most one accent decision visible per card; palette from §3 only
- [ ] Dark cards contain zero manual color overrides
- [ ] The page would pass as a Posy marketing screenshot

If any box fails, fix the PBIR and re-review — "technically valid" is not done.
