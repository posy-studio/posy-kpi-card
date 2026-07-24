"use strict";
import powerbi from "powerbi-visuals-api";
import DialogConstructorOptions = powerbi.extensibility.visual.DialogConstructorOptions;
import IDialogHost = powerbi.extensibility.visual.IDialogHost;
import { el, clear, parseSvg } from "../util/dom";
import { buildTrend } from "../render/sparkline";
import { buildProgressBar, buildBulletBar } from "../render/targetBar";
import { formatCallout, setFormatLocale, formatDeltaPercent } from "../util/format";
import { CFConfig, CfRule, BasedOn, OPS, OP_LABEL, PALETTE, MAX_RULES, matchIndex, trendColorFor, parseConfig, parseRuleValue } from "../model/cfConfig";
import "./../../style/cf-dialog.less";

/** Real card-data snapshot the visual passes for the live preview (formatted with the card's own params). */
interface PvData {
  label: string; valueFormatted: string; valueRaw: number; valueIsBlank: boolean;
  hasTrend: boolean; trend: number[];
  hasComparison: boolean; deltaFraction: number; deltaLabel: string;
  showChange: boolean; showComparisonValue: boolean; comparisonValueFormatted: string;
  hasTarget: boolean; targetRaw: number; goalPct: number | null;
  valueFormatString: string; displayUnits: string; decimals: number; locale: string; isReal: boolean;
  // the author's card theme (resolved surface + ink ramp) so the preview card mirrors it, not the dialog chrome
  cardSurface: string; cardInk: string; cardInk2: string; cardMuted: string; cardFaint: string; cardLine: string; cardRaise: string; cardPos: string; cardNeg: string;
}
/** What the visual hands the dialog: the CF config to edit + the author's layout + real data for the preview. */
interface CfDialogInit { config?: CFConfig; preview?: { preset?: string; trendType?: string; goalType?: string; data?: PvData }; }

/** Fallback sample when no real data arrives (defensive — the visual always sends real data). */
const SAMPLE_PVDATA: PvData = {
  label: "NET REVENUE", valueFormatted: "$4.82M", valueRaw: 4820000, valueIsBlank: false,
  hasTrend: true, trend: [3.1, 3.0, 3.4, 3.3, 3.8, 3.6, 4.0, 4.1, 3.9, 4.4, 4.6, 4.82],
  hasComparison: true, deltaFraction: 0.124, deltaLabel: "vs last month",
  showChange: true, showComparisonValue: false, comparisonValueFormatted: "$4.29M",
  hasTarget: true, targetRaw: 6000000, goalPct: 80,
  valueFormatString: "", displayUnits: "millions", decimals: 2, locale: "", isReal: false,
  cardSurface: "#FFFFFF", cardInk: "#16161D", cardInk2: "#3A3A45", cardMuted: "#71717A", cardFaint: "#A1A1AA",
  cardLine: "rgba(20,20,30,.08)", cardRaise: "#F6F6F8", cardPos: "#0A8056", cardNeg: "#D23A3E",
};

declare global {
   
  var dialogRegistry: { [id: string]: unknown };
}

/* ---------- mode metadata (UI only — the model lives in cfConfig; scrubber ranges compute from real data) ---------- */
interface Reading { min: number; max: number; step: number; def: number; label: string; fmt: (v: number) => string; }
interface ModeMeta { key: BasedOn; name: string; desc: string; unit: string; icon: string; }
const MODES: ModeMeta[] = [
  { key: "value",  name: "Value", desc: "The headline number itself", unit: "", icon: "value" },
  { key: "pct",    name: "% of Target", desc: "The value as a percent of its target", unit: "%", icon: "target" },
  { key: "change", name: "Change vs comparison %", desc: "The delta vs the comparison period", unit: "%", icon: "change" },
  { key: "trend",  name: "Trend direction", desc: "Whether the trend rose or fell over the period", unit: "", icon: "trend" },
];
const MODE: { [k: string]: ModeMeta } = {};
MODES.forEach(m => { MODE[m.key] = m; });

const RISING  = [3.1, 3.0, 3.4, 3.3, 3.8, 3.6, 4.0, 4.1, 3.9, 4.4, 4.6, 4.82];
const FALLING = [4.8, 4.7, 4.9, 4.5, 4.4, 4.2, 4.0, 3.9, 3.7, 3.5, 3.4, 3.1];
const FLATISH = [3.92, 4.0, 3.95, 4.05, 3.9, 4.0, 3.96, 4.02, 3.93, 4.0, 3.97, 4.0];
const DEFAULT_LINE = "#5B57E0";

/* ---------- scrubber ranges, calibrated to the author's real data magnitude ---------- */
function niceCeil(x: number): number {
  if (!(x > 0)) return 0;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const n = x / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
/** Value scrubber: 0 (or −max for a negative value) → ~2× the real value, rounded to a clean bound, defaulting to it. */
function valueScrub(d: PvData): Reading {
  const fmt = (x: number): string => formatCallout(x, d.valueFormatString, d.displayUnits, d.decimals);
  const v = d.valueRaw;
  if (!isFinite(v) || v === 0 || d.valueIsBlank) return { min: 0, max: 100, step: 1, def: 0, label: "Test value", fmt };
  const max = niceCeil(Math.abs(v) * 2) || Math.abs(v) * 2;
  const min = v < 0 ? -max : 0;
  return { min, max, step: (max - min) / 500, def: v, label: "Test value", fmt };
}
/** % of Target scrubber: 0 → max(150, ~1.3× the real reading), defaulting to the real % of target. */
function pctScrub(d: PvData): Reading {
  const def = d.goalPct != null && isFinite(d.goalPct) ? Math.max(0, Math.min(500, d.goalPct)) : 92;
  const max = Math.max(150, Math.ceil(def * 1.3 / 10) * 10);
  return { min: 0, max, step: 1, def: Math.round(def), label: "Test % of target", fmt: (x) => `${Math.round(x)}%` };
}
/** Change scrubber: symmetric range around max(40, ~1.5× the real change), defaulting to the real change %. */
function changeScrub(d: PvData): Reading {
  const def = d.hasComparison && isFinite(d.deltaFraction) ? d.deltaFraction * 100 : 12;
  const bound = Math.max(40, Math.ceil(Math.abs(def) * 1.5 / 10) * 10);
  return { min: -bound, max: bound, step: 1, def: Math.round(def), label: "Test change", fmt: (x) => `${x > 0 ? "+" : ""}${Math.round(x)}%` };
}

/* ---------- inline icons ---------- */
const PATHS: { [k: string]: [string, number] } = {
  chev:   ['<path d="M4 6l4 4 4-4"/>', 16],
  check:  ['<path d="M3.5 8.5l3 3 6-7"/>', 16],
  x:      ['<path d="M4 4l8 8M12 4l-8 8"/>', 16],
  trash:  ['<path d="M3 4.5h10M6.5 4.5V3.2c0-.4.3-.7.7-.7h1.6c.4 0 .7.3.7.7v1.3M5 4.5l.5 8c0 .4.3.7.7.7h3.6c.4 0 .7-.3.7-.7l.5-8"/>', 16],
  plus:   ['<path d="M8 3.5v9M3.5 8h9"/>', 16],
  value:  ['<path d="M5 13.5L8 9l2.5 3L15 5.5"/><path d="M4 16.5h12"/>', 20],
  target: ['<circle cx="10" cy="10" r="6.5"/><circle cx="10" cy="10" r="2.6"/>', 20],
  change: ['<path d="M4 12l4-4 3 3 5-6"/><path d="M16 8.5V5h-3.5"/>', 20],
  trend:  ['<path d="M3.5 14l3.5-4 2.5 2.2L16 5.5"/>', 20],
  up:     ['<path d="M3.5 10.5L8 5.5l4.5 5"/>', 16],
  flat:   ['<path d="M3.5 8h9"/>', 16],
  down:   ['<path d="M3.5 5.5L8 10.5l4.5-5"/>', 16],
};
function ico(name: string, size: number, cls?: string): SVGElement {
  const [inner, vb] = PATHS[name];
  const svg = parseSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${vb} ${vb}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`);
  if (cls) svg.setAttribute("class", cls);
  return svg;
}
const isHex = (c: string): boolean => /^#[0-9a-fA-F]{6}$/.test(c);

export class CfEditorDialog {
  static id = "CfEditorDialog";

  constructor(options: DialogConstructorOptions, initialState: CfDialogInit, hostArg?: IDialogHost) {
    const host: IDialogHost | undefined = (options && options.host) || hostArg;
    const init: CfDialogInit = (initialState || {}) as CfDialogInit;
    const cfg: CFConfig = parseConfig(JSON.stringify(init.config || {}));
    const push = (): void => { if (host && host.setResult) host.setResult(cfg); };

    // the author's actual layout + data (so the preview mirrors their card, not a fixed sample)
    const pvCtx = {
      preset: (init.preview && init.preview.preset) || "trend",
      trendType: (init.preview && init.preview.trendType) || "area",
      goalType: (init.preview && init.preview.goalType) || "progress",
    };
    const pvData: PvData = (init.preview && init.preview.data && init.preview.data.isReal) ? init.preview.data : SAMPLE_PVDATA;
    setFormatLocale(pvData.locale); // the dialog runs in its own context — set the locale for formatCallout

    // scrubber ranges calibrated to the real magnitude, so you test thresholds at YOUR scale
    const readings: { [k: string]: Reading } = { value: valueScrub(pvData), pct: pctScrub(pvData), change: changeScrub(pvData) };
    // preview sim state — each scrubber opens on the real reading; trend mode uses a movement selector
    const readMap: { [k: string]: number } = { value: readings.value.def, pct: readings.pct.def, change: readings.change.def };
    let move: "up" | "flat" | "down" = "up";

    const root = el("div", { class: "cfd-body" });
    options.element.appendChild(root);

    let closeOpen: (() => void) | null = null;
    const closePopover = (): void => { if (closeOpen) { closeOpen(); closeOpen = null; } };
    const openMenu = (container: HTMLElement, menu: HTMLElement, onClose?: () => void): (() => void) => {
      closePopover();
      container.appendChild(menu);
      const away = (e: MouseEvent): void => { if (!container.contains(e.target as Node)) close(); };
      const close = (): void => { menu.remove(); document.removeEventListener("mousedown", away); if (onClose) onClose(); if (closeOpen === close) closeOpen = null; };
      setTimeout(() => document.addEventListener("mousedown", away), 0);
      closeOpen = close;
      return close;
    };

    /* ---------- live-eval (preview/active-badge use the SCRUBBER reading, a sample — not real data) ---------- */
    const matchedIdx = (): number => {
      if (cfg.basedOn === "trend") return -1;
      return matchIndex(cfg.rules[cfg.basedOn as "value" | "pct" | "change"], readMap[cfg.basedOn]);
    };
    // Which apply-to toggle governs the PREVIEWED layout's element (trend line vs target bar).
    const appliesToPreview = (): boolean =>
      pvCtx.preset === "trend" ? cfg.applyTrendLine
      : pvCtx.preset === "goal" ? cfg.applyTargetBar : false;
    const lineColor = (): string => {
      let c: string;
      if (cfg.basedOn === "trend") c = trendColorFor(cfg.trend, move);
      else { const m = matchedIdx(); c = m >= 0 ? cfg.rules[cfg.basedOn as "value" | "pct" | "change"][m].color : DEFAULT_LINE; }
      return appliesToPreview() ? c : DEFAULT_LINE;
    };

    /* ---------- shared field controls ---------- */
    const eyebrow = (text: string): HTMLElement => el("span", { class: "cfd-eyebrow" }, text);

    const opPicker = (rule: CfRule, onChange: () => void): HTMLElement => {
      const wrap = el("div", { class: "cfd-op" });
      const btn = el("button", { class: "cfd-op-btn", type: "button" }, el("span", {}, rule.op === "is not blank" ? "not blank" : rule.op), ico("chev", 14, "cv"));
      btn.addEventListener("click", () => {
        const menu = el("div", { class: "cfd-op-menu" });
        OPS.forEach(op => {
          const glyph = op === "between" ? "↔" : op === "is not blank" ? "∅" : op;
          const opt = el("div", { class: `cfd-op-opt ${op === rule.op ? "on" : ""}` }, el("span", { class: "cfd-op-glyph" }, glyph), OP_LABEL[op]);
          opt.addEventListener("click", () => { rule.op = op; closePopover(); onChange(); });
          menu.appendChild(opt);
        });
        openMenu(wrap, menu);
      });
      wrap.appendChild(btn);
      return wrap;
    };
    const valInput = (unit: string, value: string, ph: string, mag: boolean, onInput: (v: string) => void): HTMLElement => {
      const wrap = el("div", { class: `cfd-val ${unit ? "has-unit" : ""}` });
      const inp = el("input", { value, placeholder: ph, inputMode: mag ? "text" : "decimal" }) as HTMLInputElement;
      // Value mode accepts K/M/B/T suffixes so "3M" is allowed (parseRuleValue turns it into the raw number).
      inp.addEventListener("input", () => {
        inp.value = inp.value.replace(mag ? /[^0-9.\-,kmbtKMBT]/g : /[^0-9.\-]/g, "");
        onInput(inp.value);
      });
      wrap.appendChild(inp);
      if (unit) wrap.appendChild(el("span", { class: "cfd-val-unit" }, unit));
      return wrap;
    };
    const colorPicker = (get: () => string, set: (c: string) => void, afterSet?: () => void): HTMLElement => {
      const wrap = el("div", { class: "cfd-cl" });
      const btn = el("button", { class: "cfd-cl-btn", type: "button", "aria-label": "Choose color" }) as HTMLButtonElement;
      btn.style.background = get();
      const apply = (c: string): void => { set(c); btn.style.background = c; push(); if (afterSet) afterSet(); };
      btn.addEventListener("click", () => {
        const pop = el("div", { class: "cfd-cl-pop" });
        const grid = el("div", { class: "cfd-cl-grid" });
        PALETTE.forEach(c => {
          const chip = el("button", { class: `cfd-cl-chip ${c.toLowerCase() === get().toLowerCase() ? "on" : ""}`, type: "button", title: c }) as HTMLButtonElement;
          chip.style.background = c;
          chip.addEventListener("click", () => { apply(c); closePopover(); });
          grid.appendChild(chip);
        });
        pop.appendChild(grid);
        const custom = el("div", { class: "cfd-cl-custom" });
        const native = el("input", { type: "color" }) as HTMLInputElement;
        native.value = isHex(get()) ? get().toLowerCase() : "#5b57e0";
        const hex = el("span", { class: "cfd-cl-hex" }, get().toUpperCase());
        native.addEventListener("input", () => { apply(native.value); hex.textContent = native.value.toUpperCase(); });
        custom.appendChild(native);
        custom.appendChild(el("label", {}, "Custom"));
        custom.appendChild(hex);
        pop.appendChild(custom);
        openMenu(wrap, pop);
      });
      wrap.appendChild(btn);
      return wrap;
    };

    /* ---------- dynamic refs (updated by refreshDynamic, not a full re-render) ---------- */
    let pvBodyHost: HTMLElement | null = null;
    let pvValueEl: HTMLElement | null = null;
    let pvFoot: HTMLElement | null = null;

    // In Value mode the callout tracks the scrubber (a live what-if); other modes keep the real value.
    const setValueText = (): void => {
      if (!pvValueEl) return;
      pvValueEl.textContent = (cfg.basedOn === "value" && !pvData.valueIsBlank && isFinite(readMap.value))
        ? formatCallout(readMap.value, pvData.valueFormatString, pvData.displayUnits, pvData.decimals)
        : pvData.valueFormatted;
    };

    // Does the previewed card actually have a chart element CF can recolor? Headline never; a Trend
    // layout needs a real series (or the direction sim); a Target layout needs a bound target. When it
    // doesn't, we show NO chart (not a fake sample line) — the preview stays honest to "Your data".
    const previewHasChart = (): boolean => {
      if (pvCtx.preset === "headline") return false;
      if (pvCtx.preset === "goal") return pvData.hasTarget;
      return cfg.basedOn === "trend" || (pvData.hasTrend && pvData.trend.length >= 2);
    };

    const refreshDynamic = (): void => {
      const lc = lineColor();
      const isGoal = pvCtx.preset === "goal";
      const trendMode = cfg.basedOn === "trend";
      const hasChart = previewHasChart();
      setValueText();
      if (pvBodyHost) {
        clear(pvBodyHost);
        pvBodyHost.className = "cfd-pvc-body cfd-pvc-" + (!hasChart ? "none" : isGoal ? "goal" : "trend");
        if (!hasChart) {
          /* no trend line / target bar on this card → nothing for CF to recolor (no fake line) */
        } else if (isGoal) {
          const gp = pvData.goalPct != null && isFinite(pvData.goalPct) ? pvData.goalPct : 0;
          if (pvCtx.goalType === "fixed" && isFinite(pvData.valueRaw) && isFinite(pvData.targetRaw)) {
            const scaleMax = (Math.max(pvData.valueRaw, pvData.targetRaw) * 1.1) || 1;
            pvBodyHost.appendChild(buildBulletBar(pvData.valueRaw / scaleMax * 100, pvData.targetRaw / scaleMax * 100, lc));
          } else {
            pvBodyHost.appendChild(buildProgressBar(Math.round(Math.max(0, Math.min(100, gp))), lc));
          }
          pvBodyHost.appendChild(el("div", { class: "cfd-pvc-goalfoot" }, `${Math.round(gp)}% to goal`));
        } else {
          const series = trendMode
            ? (move === "up" ? RISING : move === "down" ? FALLING : FLATISH)
            : pvData.trend; // hasChart guarantees a real series in threshold mode
          pvBodyHost.appendChild(buildTrend(series, lc, pvCtx.trendType as "area" | "line" | "bars", 252, 80));
        }
      }
      if (pvFoot) {
        clear(pvFoot);
        const off = !appliesToPreview();
        const dot = el("span", { class: "cfd-test-dot" });
        dot.style.background = lc; // lc respects the layout's apply-to toggle (default when off) → the dot tracks the previewed line
        pvFoot.appendChild(dot);
        const tail = !hasChart ? " · no line/bar on this card to recolor"
          : off ? " · Apply to is off — line stays default"
          : " · recolors to this";
        if (cfg.basedOn === "trend") {
          const word = move === "up" ? "rose" : move === "down" ? "fell" : "held flat";
          pvFoot.appendChild(el("span", {}, "Trend ", el("b", {}, word), tail));
        } else {
          const m = matchedIdx();
          if (m >= 0) pvFoot.appendChild(el("span", {}, "Matches ", el("b", {}, `Rule ${m + 1}`), tail));
          else pvFoot.appendChild(el("span", { class: "cfd-test-none" }, "No rule matches — keeps the default color"));
        }
      }
    };

    /* ---------- full render ---------- */
    const render = (): void => {
      closePopover();
      clear(root);
      pvBodyHost = null; pvValueEl = null; pvFoot = null;
      const controls = el("div", { class: "cfd-controls" });
      controls.appendChild(buildBasedOn());
      controls.appendChild(cfg.basedOn === "trend" ? buildTrendCtrls() : buildThreshold());
      controls.appendChild(buildApplyTo());
      root.appendChild(controls);
      root.appendChild(buildPreview());
      refreshDynamic();
      push();
    };

    const buildBasedOn = (): HTMLElement => {
      const g = el("div", { class: "cfd-group" });
      g.appendChild(el("div", { class: "cfd-group-head" }, eyebrow("Based on")));
      const m = MODE[cfg.basedOn];
      const dd = el("div", { class: "cfd-dd" });
      const btn = el("button", { class: "cfd-dd-btn", type: "button" },
        el("span", { class: "cfd-dd-ic" }, ico(m.icon, 18)),
        el("span", { class: "cfd-dd-tt" }, el("span", { class: "cfd-dd-name" }, m.name), el("span", { class: "cfd-dd-desc" }, m.desc)),
        ico("chev", 14, "cfd-dd-cv"));
      btn.addEventListener("click", () => {
        dd.classList.add("open");
        const menu = el("div", { class: "cfd-dd-menu" });
        MODES.forEach(o => {
          const opt = el("div", { class: `cfd-dd-opt ${o.key === cfg.basedOn ? "on" : ""}` },
            el("span", { class: "cfd-dd-ic" }, ico(o.icon, 16)),
            el("span", {}, el("div", { class: "cfd-dd-opt-name" }, o.name), el("div", { class: "cfd-dd-opt-desc" }, o.desc)));
          if (o.key === cfg.basedOn) opt.appendChild(el("span", { class: "cfd-dd-check" }, ico("check", 14)));
          opt.addEventListener("click", () => { cfg.basedOn = o.key; render(); });
          menu.appendChild(opt);
        });
        openMenu(dd, menu, () => dd.classList.remove("open"));
      });
      dd.appendChild(btn);
      g.appendChild(dd);
      const prose = el("div", { class: "cfd-prose" }); prose.style.marginTop = "9px";
      if (cfg.basedOn === "trend") prose.appendChild(document.createTextNode("Colors by trend direction, like Power BI's native KPI — pick a sentiment and three colors."));
      else {
        prose.appendChild(document.createTextNode("Add rules that test the "));
        prose.appendChild(el("b", {}, m.name.toLowerCase()));
        prose.appendChild(document.createTextNode(". They run top-to-bottom — the "));
        prose.appendChild(el("b", {}, "first match wins"));
        prose.appendChild(document.createTextNode("."));
      }
      g.appendChild(prose);
      return g;
    };

    const buildThreshold = (): HTMLElement => {
      const mode = MODE[cfg.basedOn];
      const rules: CfRule[] = cfg.rules[cfg.basedOn as "value" | "pct" | "change"];
      const g = el("div", { class: "cfd-group" });
      const head = el("div", { class: "cfd-group-head" }, eyebrow(`Rules · ${rules.length} of ${MAX_RULES}`));
      const fw = el("span", { class: "cfd-prose" }, "First match wins"); fw.style.fontSize = "11.5px";
      head.appendChild(fw);
      g.appendChild(head);
      const list = el("div", { class: "cfd-rules" });
      rules.forEach((r, i) => { list.appendChild(ruleRow(mode, rules, r, i)); });
      g.appendChild(list);
      if (!rules.length) g.appendChild(el("div", { class: "cfd-empty" }, "No rules yet — add one to color the trend line / target bar."));
      const add = el("button", { class: "cfd-add", type: "button" }, ico("plus", 14), "Add rule") as HTMLButtonElement;
      add.disabled = rules.length >= MAX_RULES;
      add.addEventListener("click", () => { if (rules.length < MAX_RULES) { rules.push({ op: ">", val: "", val2: "", color: "#5B57E0" }); render(); } });
      g.appendChild(add);
      if (rules.length >= MAX_RULES) g.appendChild(el("div", { class: "cfd-maxnote" }, `Maximum of ${MAX_RULES} rules reached.`));
      return g;
    };

    const ruleRow = (mode: ModeMeta, rules: CfRule[], r: CfRule, idx: number): HTMLElement => {
      const row = el("div", { class: "cfd-rule" });
      row.appendChild(el("span", { class: "cfd-rule-idx" }, String(idx + 1)));
      row.appendChild(el("span", { class: "cfd-rule-if" }, "If"));
      const fields = el("div", { class: "cfd-rule-fields" });
      fields.appendChild(opPicker(r, render));
      if (r.op !== "is not blank") {
        const mag = mode.key === "value";
        if (r.op === "between") {
          fields.appendChild(valInput(mode.unit, r.val, "min", mag, (v) => { r.val = v; push(); refreshDynamic(); }));
          fields.appendChild(el("span", { class: "cfd-val-dash" }, "to"));
          fields.appendChild(valInput(mode.unit, r.val2, "max", mag, (v) => { r.val2 = v; push(); refreshDynamic(); }));
        } else {
          fields.appendChild(valInput(mode.unit, r.val, "value", mag, (v) => { r.val = v; push(); refreshDynamic(); }));
        }
      }
      fields.appendChild(el("span", { class: "cfd-rule-then" }, "then"));
      fields.appendChild(colorPicker(() => r.color, (c) => { r.color = c; }, refreshDynamic));
      row.appendChild(fields);
      const del = el("button", { class: "cfd-rule-del", type: "button", "aria-label": "Delete rule" }) as HTMLButtonElement;
      del.appendChild(ico("trash", 15));
      del.addEventListener("click", () => { rules.splice(idx, 1); render(); }); // a mode may have zero rules
      row.appendChild(del);
      return row;
    };

    const buildTrendCtrls = (): HTMLElement => {
      const g = el("div", { class: "cfd-group" });
      g.appendChild(el("div", { class: "cfd-group-head" }, eyebrow("Sentiment")));
      const seg = el("div", { class: "cfd-seg" }); seg.style.marginBottom = "14px";
      ([["high", "High is good"], ["low", "Low is good"]] as [string, string][]).forEach(([k, lbl]) => {
        const it = el("div", { class: `cfd-seg-i ${cfg.trend.dir === k ? "on" : ""}` }, lbl);
        it.addEventListener("click", () => { cfg.trend.dir = k as "high" | "low"; render(); });
        seg.appendChild(it);
      });
      g.appendChild(seg);
      g.appendChild(el("div", { class: "cfd-group-head" }, eyebrow("Colors")));
      const trio = el("div", { class: "cfd-trio" });
      const high = cfg.trend.dir === "high";
      const rows: ["good" | "neutral" | "bad", string, string, string][] = [
        ["good", "Good", high ? "When the trend rises" : "When the trend falls", high ? "up" : "down"],
        ["neutral", "Neutral", "When the trend holds flat", "flat"],
        ["bad", "Bad", high ? "When the trend falls" : "When the trend rises", high ? "down" : "up"],
      ];
      rows.forEach(([key, name, desc, icn]) => {
        const tr = el("div", { class: "cfd-trio-row" });
        const mean = el("span", { class: "cfd-trio-mean" }, ico(icn, 15));
        const setMean = (c: string): void => { mean.style.background = c + "22"; mean.style.color = c; };
        setMean(cfg.trend[key]);
        tr.appendChild(mean);
        tr.appendChild(el("div", { class: "cfd-trio-tt" }, el("div", { class: "cfd-trio-name" }, name), el("div", { class: "cfd-trio-desc" }, desc)));
        tr.appendChild(colorPicker(() => cfg.trend[key], (c) => { cfg.trend[key] = c; setMean(c); }, refreshDynamic));
        trio.appendChild(tr);
      });
      g.appendChild(trio);
      return g;
    };

    const buildApplyTo = (): HTMLElement => {
      const g = el("div", { class: "cfd-group" });
      g.appendChild(el("div", { class: "cfd-group-head" }, eyebrow("Apply to")));
      const apply = el("div", { class: "cfd-apply" });
      const toggleRow = (on: boolean, name: string, desc: string, set: (v: boolean) => void): HTMLElement => {
        const row = el("div", { class: `cfd-check ${on ? "on" : ""}` });
        const box = el("span", { class: "cfd-box" }); if (on) box.appendChild(ico("check", 14));
        row.appendChild(box);
        row.appendChild(el("div", { class: "cfd-check-tt" },
          el("div", { class: "cfd-check-name" }, name),
          el("div", { class: "cfd-check-desc" }, desc)));
        row.addEventListener("click", () => { set(!on); render(); });
        return row;
      };
      apply.appendChild(toggleRow(cfg.applyTrendLine, "Trend line", "Recolors the sparkline on a Trend card.", (v) => { cfg.applyTrendLine = v; }));
      apply.appendChild(toggleRow(cfg.applyTargetBar, "Target bar", "Recolors the progress / bullet bar on a Target card.", (v) => { cfg.applyTargetBar = v; }));
      const locked = el("div", { class: "cfd-check locked" });
      locked.appendChild(el("span", { class: "cfd-box" }, ico("x", 11)));
      locked.appendChild(el("div", { class: "cfd-check-tt" },
        el("div", { class: "cfd-check-name" }, "Callout value"),
        el("div", { class: "cfd-check-desc" }, "Kept neutral so the headline number stays legible.")));
      locked.appendChild(el("span", { class: "cfd-lockpill" }, "By design"));
      apply.appendChild(locked);
      g.appendChild(apply);
      return g;
    };

    /* ---------- preview pane (right column) — a sample card recoloring live + a teaching scrubber ---------- */
    const buildPreview = (): HTMLElement => {
      const pv = el("div", { class: "cfd-preview" });
      pv.appendChild(el("div", { class: "cfd-pv-h" },
        el("span", { class: "cfd-pv-title" }, "Live preview"),
        el("span", { class: "cfd-pv-live" }, el("i", {}), pvData.isReal ? "Your data" : "Sample")));

      // preview card — the author's real data + layout; only the trend line / target bar recolors per the rules
      const trendMode = cfg.basedOn === "trend";
      const card = el("div", { class: "cfd-pvc" });
      // Scope the AUTHOR'S card theme (surface + ink) to just this preview card, so it mirrors the real
      // card independent of the dialog's light/dark chrome (a light card previews light in a dark dialog).
      const cv: { [k: string]: string } = {
        "--cfd-surface": pvData.cardSurface, "--card": pvData.cardSurface, "--cfd-raise": pvData.cardRaise,
        "--cfd-ink": pvData.cardInk, "--cfd-ink2": pvData.cardInk2, "--cfd-muted": pvData.cardMuted,
        "--cfd-faint": pvData.cardFaint, "--cfd-line": pvData.cardLine, "--pos": pvData.cardPos, "--neg": pvData.cardNeg,
      };
      Object.keys(cv).forEach(k => card.style.setProperty(k, cv[k]));
      card.appendChild(el("div", { class: "cfd-pvc-eyebrow" }, pvData.label));
      pvValueEl = el("div", { class: "cfd-pvc-value" }); // refreshDynamic fills it (tracks the scrubber in Value mode)
      card.appendChild(pvValueEl);
      // Comparison row — mirrors the real card's Change / Comparison Value display (the two Delta toggles).
      // Trend mode simulates the direction (teaching the CF color); threshold modes show the real delta.
      if (pvCtx.preset !== "goal") {
        const hasDelta = pvData.showChange && (trendMode || pvData.hasComparison);
        const hasValue = pvData.showComparisonValue && !!pvData.comparisonValueFormatted;
        if (hasDelta || hasValue) {
          const deltaUp = trendMode ? move !== "down" : pvData.deltaFraction >= 0;
          const deltaTxt = trendMode ? (move === "flat" ? "0.4%" : "12.4%") : formatDeltaPercent(pvData.deltaFraction);
          const label = pvData.deltaLabel || "vs last period";
          const deltaSpan = hasDelta ? el("span", { class: `cfd-pvc-d ${deltaUp ? "up" : "down"}` }, deltaUp ? "▲" : "▼", " " + deltaTxt) : null;
          const cap = el("span", { class: "cfd-pvc-vs" });
          const row = el("div", { class: "cfd-pvc-delta" });
          if (hasValue) {
            // label → value → change: "Last period: $4.29M ▲ 12.4%"
            const raw = label.replace(/^vs\s+/i, "");
            const period = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "";
            if (period) cap.appendChild(document.createTextNode(period + ": "));
            cap.appendChild(el("span", { class: "cfd-pvc-cmpv" }, pvData.comparisonValueFormatted));
            row.appendChild(cap);
            if (deltaSpan) row.appendChild(deltaSpan);
          } else {
            // change-only: "▲ 12.4% vs last period"
            if (deltaSpan) row.appendChild(deltaSpan);
            cap.appendChild(document.createTextNode(label));
            row.appendChild(cap);
          }
          card.appendChild(row);
        }
      }
      pvBodyHost = el("div", { class: "cfd-pvc-body cfd-pvc-trend" }); // refreshDynamic sets the real class + content
      card.appendChild(pvBodyHost);
      pv.appendChild(el("div", { class: "cfd-pv-card" }, card));

      // teaching device: scrubber (threshold) or movement selector (trend)
      const test = el("div", { class: "cfd-test" });
      if (trendMode) {
        test.appendChild(el("div", { class: "cfd-test-top" }, el("span", { class: "cfd-test-l" }, "Preview the trend movement")));
        const dir = el("div", { class: "cfd-dirpv" });
        ([["up", "Rose"], ["flat", "Flat"], ["down", "Fell"]] as [string, string][]).forEach(([k, lbl]) => {
          const it = el("div", { class: `cfd-dirpv-i ${move === k ? "on" : ""}` }, ico(k, 14), " " + lbl);
          it.addEventListener("click", () => { move = k as "up" | "flat" | "down"; render(); });
          dir.appendChild(it);
        });
        test.appendChild(dir);
      } else {
        const rd = readings[cfg.basedOn];
        const top = el("div", { class: "cfd-test-top" });
        top.appendChild(el("span", { class: "cfd-test-l" }, rd.label));
        const valEl = el("span", { class: "cfd-test-v" }, rd.fmt(readMap[cfg.basedOn]));
        top.appendChild(valEl);
        test.appendChild(top);
        const slider = el("input", { type: "range", min: String(rd.min), max: String(rd.max), step: String(rd.step), value: String(readMap[cfg.basedOn]) }) as HTMLInputElement;
        slider.addEventListener("input", () => { readMap[cfg.basedOn] = parseFloat(slider.value); valEl.textContent = rd.fmt(readMap[cfg.basedOn]); refreshDynamic(); });
        test.appendChild(slider);
      }
      pvFoot = el("div", { class: "cfd-test-foot" });
      test.appendChild(pvFoot);
      pv.appendChild(test);

      const note = !previewHasChart()
        ? "This card has no trend line or target bar for conditional formatting to recolor — bind a Trend axis or a Target (or switch layout) to use it."
        : trendMode
          ? "The card colors by whether the visible trend rose, fell, or held flat — no thresholds."
          : "Drag to test readings against your rules — the card recolors and the first match wins.";
      pv.appendChild(el("div", { class: "cfd-prose cfd-pv-note" }, note));
      return pv;
    };

    render();
  }
}

globalThis.dialogRegistry = globalThis.dialogRegistry || {};
globalThis.dialogRegistry[CfEditorDialog.id] = CfEditorDialog;
