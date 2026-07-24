# KPI Card by Posy

A single-metric KPI card for Power BI — one value, told well. Three layout families (**Trend**, **Target**, **Headline**), an optional period delta, conditional formatting, auto-contrast text, and a fully configurable surface.

Available on [Microsoft AppSource](https://appsource.microsoft.com/marketplace/apps?product=power-bi-visuals&search=KPI%20Card%20by%20Posy).

## Features

- **Three layouts** — Trend (value + area/line/bar sparkline), Target (progress or fixed-benchmark bullet), Headline (the number is the story). Pick from the dropdown or the on-canvas layout gallery.
- **Comparison delta** — ▲/▼ change vs. any comparison measure, auto-labeled "vs *field*", with an optional comparison value and a **Lower is better** toggle for cost/error metrics.
- **Conditional formatting** — recolor the trend line or target bar by value, % of target, change vs. comparison, or trend direction. Rules are built in a visual editor with a live preview — no DAX required.
- **Correct aggregation by default** — the headline value is the measure's own DAX grand total (not a client-side sum), so non-additive measures (ratios, averages, distinct counts) are always right. An Aggregation override (Last/First/Avg/Min/Max) is available.
- **Auto-contrast** — text flips light/dark based on the card surface so it stays readable on any background, including custom brand colors and dark themes.
- **Accessible** — WCAG AA contrast, High Contrast mode support, reduced-motion support, screen-reader summary.

## Getting started

1. Add a measure to **Value** — the headline number.
2. Optionally add a **Trend axis** (date) for the sparkline, a **Comparison** measure for the ▲/▼ delta, a **Target** for the goal layouts, and **Tooltips** measures.
3. Pick a layout under **Format → Card style → Layout** (or enable **Show layout gallery**).

Number formatting follows your measure's format string (currency symbol, locale); display units and decimals are set per-card under **Callout → Display units**.

## Support

- **Email:** emasiku@outlook.com
- **Issues:** please open a [GitHub issue](https://github.com/posy-design/posy-kpi-card/issues) with your Power BI version and steps to reproduce.

## Privacy

The visual runs entirely inside the Power BI sandbox, makes no external requests, and collects no data. See [PRIVACY.md](PRIVACY.md).

## Building from source

```
npm install
npm run package
```

The packaged `.pbiviz` is produced in `dist/`. Requires [powerbi-visuals-tools](https://www.npmjs.com/package/powerbi-visuals-tools).

## License

[MIT](LICENSE)
