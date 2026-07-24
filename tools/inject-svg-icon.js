// Post-build step (wired into `npm run package`): replace the packaged pane icon (content.iconBase64)
// with an SVG data-URI, so the Visualizations-pane icon is a crisp vector instead of a 20x20 PNG raster.
// pbiviz accepts only a 20x20 PNG as the SOURCE asset (assets/icon.png), but Power BI renders an SVG in
// the iconBase64 slot fine (verified against a shipping certified visual). Node + jszip only — no network,
// no external resources — so the certified build stays reproducible from `npm run package`.
"use strict";
const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

const SVG_PATH = path.join(__dirname, "..", "assets", "KPI-pane-icon.svg");
const DIST_DIR = path.join(__dirname, "..", "dist");

async function main() {
  const svg = fs.readFileSync(SVG_PATH);
  const uri = "data:image/svg+xml;base64," + svg.toString("base64");

  // The just-built package = the most recently modified .pbiviz in dist/.
  const pkgs = fs.readdirSync(DIST_DIR)
    .filter((f) => f.endsWith(".pbiviz"))
    .map((f) => ({ f, m: fs.statSync(path.join(DIST_DIR, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  if (!pkgs.length) throw new Error("inject-svg-icon: no .pbiviz found in dist/");
  const target = path.join(DIST_DIR, pkgs[0].f);

  const zip = await JSZip.loadAsync(fs.readFileSync(target));
  let swapped = 0;
  for (const name of Object.keys(zip.files)) {
    if (!name.endsWith(".json")) continue;
    let obj;
    try { obj = JSON.parse(await zip.file(name).async("string")); } catch { continue; }
    if (obj && obj.content && typeof obj.content === "object" && "iconBase64" in obj.content) {
      obj.content.iconBase64 = uri;
      zip.file(name, JSON.stringify(obj));
      swapped++;
    }
  }
  const out = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  fs.writeFileSync(target, out);
  console.log(`injected SVG icon into ${swapped} member(s); svg=${svg.length}B -> data-uri=${uri.length} chars -> ${path.basename(target)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
