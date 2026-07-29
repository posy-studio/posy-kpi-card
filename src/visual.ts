/*
 *  Posy KPI Card — Power BI custom visual
 */
"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { createTooltipServiceWrapper, ITooltipServiceWrapper } from "powerbi-visuals-utils-tooltiputils";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import DataView = powerbi.DataView;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;
import ISelectionId = powerbi.visuals.ISelectionId;
import DialogAction = powerbi.DialogAction;
import VisualDialogPositionType = powerbi.VisualDialogPositionType;
import ModalDialogResult = powerbi.extensibility.visual.ModalDialogResult;

import { VisualFormattingSettingsModel } from "./settings";
import { LicenseGate } from "./licensing";
import { CfEditorDialog } from "./dialogs/CfEditorDialog";
import { CFConfig, parseConfig, serializeConfig } from "./model/cfConfig";
import { parseDataView, isLoading, KpiViewModel } from "./model/viewModel";
import { renderCard, renderEmpty, renderSkeleton, resolveChrome, CardProps, Preset } from "./render/card";
import { renderGallery, LayoutPick } from "./render/gallery";
import { TrendTooltip } from "./render/sparkline";
import { InkMode } from "./util/contrast";
import { TrendType } from "./render/sparkline";
import { formatRaw, setFormatLocale, formatCallout, resolveBlank } from "./util/format";

export class Visual implements IVisual {
  private events: IVisualEventService;
  private host: IVisualHost;
  private target: HTMLElement;
  private settings: VisualFormattingSettingsModel;
  private formattingSettingsService: FormattingSettingsService;
  private tooltipServiceWrapper: ITooltipServiceWrapper;
  private prevShowGallery = false; // tracks the gallery toggle so we only enter focus mode on the flip
  private galleryHadFocus = false; // was the gallery actually in focus mode last update (to detect exit)
  private prevShowCfEditor = false; // tracks the CF "Edit rules" toggle so we open the dialog only on the flip
  private cfDialogOpen = false;      // a CF dialog is currently up (don't re-open on intervening updates)
  private cfEditorInit = false;      // first update seen — a persisted showEditor:true on cold start is stale, not a flip
  private license: LicenseGate;

  constructor(options: VisualConstructorOptions) {
    this.host = options.host;
    this.events = options.host.eventService;
    this.formattingSettingsService = new FormattingSettingsService();
    this.tooltipServiceWrapper = createTooltipServiceWrapper(options.host.tooltipService, options.element);
    this.target = options.element;
    this.target.classList.add("posy-visual");
    // Plans resolve async; until then we render normally (pending). If the resolution lands
    // "unlicensed" after a render already happened, blank the card now — the host overlay
    // (VisualIsBlocked) goes up via syncNotification and nothing should linger under it.
    this.license = new LicenseGate(options.host.licenseManager, () => {
      this.license.syncNotification();
      if (!this.license.allowRender()) this.target.textContent = "";
    });
  }

  public update(options: VisualUpdateOptions): void {
    this.events.renderingStarted(options);
    try {
      // License gate (sold through Microsoft): a positively-unlicensed user gets a blank visual
      // under the host's "license required" overlay. pending/lenient/licensed all render normally.
      this.license.syncNotification();
      if (!this.license.allowRender()) {
        this.target.textContent = "";
        this.events.renderingFinished(options);
        return;
      }
      setFormatLocale(this.host.locale); // viewer-locale number/date/currency grouping
      const dataView = options.dataViews && options.dataViews[0];
      this.settings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, dataView);

      // Comparison defaults OFF on the Goal layout, ON for Trend/Headline. Only force the default when
      // the author has NEVER set delta.showComparison themselves — a property-specific check, because
      // syncComparisonLabel persists a `delta` object (comparisonLabel/...Field) WITHOUT this key, so we
      // must test the key itself, not the object's existence. A persisted value (true OR false) wins.
      const showCompSet = dataView?.metadata?.objects?.delta?.showComparison;
      if (showCompSet === undefined && this.settings.cardStyle.stylePreset.value.value === "goal") {
        this.settings.delta.showComparison.value = false;
      }

      const vm = parseDataView(dataView, this.settings.callout.valueAggregation.value.value as string, this.settings.cardStyle.trendWindow.value.value as string, this.settings.cardStyle.tooltipDateFormat.value.value as string);
      this.syncComparisonLabel(this.settings, vm);
      this.syncCalloutLabel(this.settings, vm);
      this.applyPaneVisibility(this.settings, vm);

      const props = this.buildProps(this.settings);
      // Windows High Contrast: render with only the OS palette (accessibility + a cert-recommended feature).
      const cp = this.host.colorPalette;
      if (cp && cp.isHighContrast && cp.foreground && cp.background) {
        props.highContrast = {
          on: true, foreground: cp.foreground.value, background: cp.background.value,
          foregroundSelected: (cp.foregroundSelected && cp.foregroundSelected.value) || cp.foreground.value,
        };
      }
      const tip = this.buildTooltip(dataView, vm);

      // OKViz-style: flipping the gallery toggle ON opens it in focus mode; leaving focus (via Power
      // BI's own "Back to report") while it's up closes the gallery again. Enter focus only on the
      // flip; dismiss only after we'd actually reached focus — so a slow focus transition isn't read
      // as an exit. If focus never engages, the gallery still renders inline (graceful fallback).
      const showGallery = this.settings.cardStyle.showLayoutGallery.value;
      const inFocus = !!options.isInFocus;
      if (showGallery && !this.prevShowGallery) this.host.switchFocusModeState(true);   // toggle on  → enter focus
      if (!showGallery && this.prevShowGallery) this.host.switchFocusModeState(false);  // toggle off → leave focus too
      // Leaving focus while the gallery is up (Power BI's own "Back to report") → go straight back to
      // the card and reset the toggle. Gated on having actually reached focus, so a slow open isn't
      // misread as a leave; if focus never engaged, the gallery just stays inline (graceful fallback).
      const leftFocus = showGallery && this.galleryHadFocus && !inFocus;
      if (leftFocus) {
        this.host.persistProperties({
          merge: [{ objectName: "cardStyle", selector: null, properties: { showLayoutGallery: false } }],
        });
      }
      this.galleryHadFocus = showGallery && inFocus;
      this.prevShowGallery = showGallery;

      // Conditional-formatting editor → opens a modal dialog when the author flips "Edit rules" on (a
      // false→true flip, mirroring the gallery). Where the host doesn't allow modal dialogs, the inline
      // pane editor is the fallback, so we just unstick the toggle. The dialog persists its result + resets
      // the toggle on OK (onCfDialogClosed); a CF dialog is independent of the card's own rendering below.
      const showCfEditor = this.settings.conditionalFormatting.showEditor.value;
      const canDialog = !!(this.host.hostCapabilities && this.host.hostCapabilities.allowModalDialog);
      if (!this.cfEditorInit) {
        // First update of this instance: a persisted showEditor:true is STALE (e.g. PBI was closed while
        // the dialog was up, or a reset persist never completed). Never auto-open on load — a spontaneous
        // dialog violates MS guidance + cert. Self-heal by resetting it; opening only ever follows a real flip.
        this.cfEditorInit = true;
        if (showCfEditor) this.resetCfEditorToggle();
      } else if (showCfEditor && !this.prevShowCfEditor) {
        if (canDialog && !this.cfDialogOpen) this.openCfDialog(this.settings, vm);
        else if (!canDialog) this.resetCfEditorToggle();
      }
      this.prevShowCfEditor = showCfEditor;

      // Gallery only while truly in the gallery state; the moment focus is left, the card/landing/
      // skeleton shows instead (so "Back to report" always returns to the card, data or not).
      if (showGallery && !leftFocus) {
        // Previews use DEFAULT styling (a fresh settings model) + sample data — never the author's
        // own theme/sizes/data. `current` (the author's active config) only drives the selected tile.
        renderGallery(this.target, this.buildProps(new VisualFormattingSettingsModel()),
          { preset: props.preset, trendType: props.trendType, goalType: props.goalTargetType },
          (pick) => this.pickLayout(pick));
      } else if (isLoading(dataView)) renderSkeleton(this.target, props);
      else if (vm.hasValue) renderCard(this.target, vm, props, tip);
      else renderEmpty(this.target, props);

      this.events.renderingFinished(options);
    } catch (error) {
      console.error("Posy KPI Card update error", error);
      this.events.renderingFailed(options, String(error));
    }
  }

  /** Map the formatting model into the resolved props the renderer needs. */
  private buildProps(s: VisualFormattingSettingsModel): CardProps {
    const cs = s.cardStyle, d = s.delta, c = s.callout, cf = s.conditionalFormatting, adv = s.advanced;
    // Custom fonts override the dropdown only when the Advanced "Custom fonts" toggle is on + a name is typed.
    const useCustom = adv.customFontsEnable.value;
    const font = (custom: string, dropdown: string): string => (useCustom && custom) ? custom : dropdown;
    return {
      preset: cs.stylePreset.value.value as Preset,
      theme: cs.theme.value.value as ("light" | "dark"),
      surfacePicked: cs.surface.value.value,
      linePicked: cs.lineColor.value.value,
      inkMode: cs.textContrast.value.value as InkMode,
      cornerRadius: cs.cornerRadius.value,
      cardShadow: cs.cardShadow.value,
      cardBorder: cs.cardBorder.value,
      borderColor: cs.borderColor.value.value,
      borderTransparency: cs.borderTransparency.value,
      shadowColor: cs.shadowColor.value.value,
      showIcon: s.icon.show.value,
      kpiIconSize: s.icon.kpiIconSize.value,
      showMenu: s.icon.showMenu.value,
      menuIconSize: s.icon.menuIconSize.value,
      iconKind: s.icon.glyph.value.value as string,
      trendType: cs.trendChartType.value.value as TrendType,
      goalTargetType: cs.goalTargetType.value.value as ("progress" | "fixed"),
      targetLabel: cs.targetLabel.value,
      displayUnits: c.displayUnits.value.value as string,
      decimals: c.decimalPlaces.value,
      calloutFontFamily: font(adv.calloutValueFont.value, c.fontFamily.value.value as string),
      calloutValueSize: c.fontSize.value,
      calloutBold: c.fontBold.value,
      calloutItalic: c.fontItalic.value,
      calloutUnderline: c.fontUnderline.value,
      calloutFontColor: c.fontColor.value.value,
      calloutShowBlankAs: c.showBlankAs.value.value as string,
      calloutBlankText: c.blankText.value,
      calloutValueWrap: c.valueTextWrap.value,
      calloutLabel: c.labelText.value,
      calloutLabelFont: font(adv.calloutLabelFont.value, c.labelFontFamily.value.value as string),
      calloutLabelSize: c.labelFontSize.value,
      calloutLabelColor: c.labelFontColor.value.value,
      calloutLabelBold: c.labelBold.value,
      calloutLabelItalic: c.labelItalic.value,
      calloutLabelUnderline: c.labelUnderline.value,
      calloutLabelWrap: c.labelTextWrap.value,
      showComparison: d.showComparison.value,
      comparisonLabel: d.comparisonLabel.value,
      lowerIsBetter: d.lowerIsBetter.value,
      varianceBackground: d.varianceBackground.value,
      deltaValueDecimals: (d.valueDecimals.value.value as string) === "auto" ? null : Number(d.valueDecimals.value.value),
      deltaValueFont: font(adv.comparisonValueFont.value, d.valueFontFamily.value.value as string),
      deltaValueSize: d.valueFontSize.value,
      deltaValueColor: d.valueFontColor.value.value,
      deltaValueBold: d.valueBold.value,
      deltaValueItalic: d.valueItalic.value,
      deltaValueUnderline: d.valueUnderline.value,
      deltaShowBlankAs: d.valueShowBlankAs.value.value as string,
      deltaBlankText: d.valueBlankText.value,
      deltaValueWrap: d.valueTextWrap.value,
      deltaLabelFont: font(adv.comparisonLabelFont.value, d.labelFontFamily.value.value as string),
      deltaLabelSize: d.labelFontSize.value,
      deltaLabelColor: d.labelFontColor.value.value,
      deltaLabelBold: d.labelBold.value,
      deltaLabelItalic: d.labelItalic.value,
      deltaLabelUnderline: d.labelUnderline.value,
      deltaLabelWrap: d.labelTextWrap.value,
      showChange: d.showChange.value,
      showComparisonValue: d.showComparisonValue.value,
      cmpFont: d.cmpFontFamily.value.value as string,
      cmpSize: d.cmpFontSize.value,
      cmpColor: d.cmpFontColor.value.value,
      cmpBold: d.cmpBold.value,
      cmpItalic: d.cmpItalic.value,
      cmpUnderline: d.cmpUnderline.value,
      cmpDisplayUnits: d.cmpDisplayUnits.value.value as string,
      cmpDecimals: d.cmpDecimals.value,
      cmpShowBlankAs: d.cmpShowBlankAs.value.value as string,
      cmpBlankText: d.cmpBlankText.value,
      cmpWrap: d.cmpTextWrap.value,
      cfEnable: cf.enable.value,
      cfConfig: parseConfig(cf.config.value),
    };
  }

  /**
   * Build per-category tooltip data for the sparkline: each point shows its period (header),
   * the trend value, and any measures dropped in the Tooltips field well. The selection id
   * enables report-page (canvas) tooltips for that point.
   */
  private buildTooltip(dataView: DataView | undefined, vm: KpiViewModel): TrendTooltip | undefined {
    const rows = dataView && dataView.matrix && dataView.matrix.rows;
    const nodes = vm.trendNodes;
    if (!vm.hasTrend || !rows || !rows.root || !nodes || !nodes.length) return undefined;
    const levels = rows.levels;

    const ids: ISelectionId[] = [];
    const infos: VisualTooltipDataItem[][] = [];
    for (let i = 0; i < vm.trendValues.length; i++) {
      ids.push(this.host.createSelectionIdBuilder().withMatrixNode(nodes[i], levels).createSelectionId());
      const items: VisualTooltipDataItem[] = [{
        header: vm.trendLabels[i],
        displayName: vm.trendValueName,
        value: formatRaw(vm.trendValues[i], vm.trendValueFormat),
      }];
      for (const col of vm.tooltipColumns) {
        items.push({ displayName: col.displayName, value: formatRaw(col.values[i], col.format) });
      }
      infos.push(items);
    }
    return { wrapper: this.tooltipServiceWrapper, infos, ids };
  }

  /**
   * Keep the comparison label tracking the bound fields: re-write it to "vs <comparison field>"
   * (persisted) when EITHER the comparison field OR the Value field changes. Hidden trackers record
   * both, so this fires on a field change but never clobbers the saved label on reload. The Value-field
   * trigger is a guardrail for the value/comparison mismatch (Value Revenue→Cost while Comparison stays
   * Revenue PY): it re-exposes the comparison basis + wipes a manual rename that could hide the stale
   * pairing — a soft nudge (it can't validate the relationship). See CLAUDE.md backlog.
   */
  private syncComparisonLabel(s: VisualFormattingSettingsModel, vm: KpiViewModel): void {
    const cmp = vm.comparisonName;
    if (!cmp) return;
    const val = vm.label; // the Value field name — a Value-field change also re-derives the label
    if (cmp === s.delta.comparisonLabelField.value && val === s.delta.comparisonValueField.value) return;
    const label = "vs " + cmp;
    s.delta.comparisonLabel.value = label;        // reflect this frame (avoid a flash)
    s.delta.comparisonLabelField.value = cmp;
    s.delta.comparisonValueField.value = val;
    this.host.persistProperties({
      merge: [{
        objectName: "delta",
        selector: null,
        properties: { comparisonLabel: label, comparisonLabelField: cmp, comparisonValueField: val },
      }],
    });
  }

  /**
   * Keep the callout eyebrow tracking the bound Value field: when the field changes, re-write the label
   * to the field's name (persisted) so it auto-fills. A hidden tracker records the field the label
   * belongs to, so this fires on a field change but never clobbers a manual rename on reload. Mirrors
   * syncComparisonLabel.
   */
  private syncCalloutLabel(s: VisualFormattingSettingsModel, vm: KpiViewModel): void {
    const name = vm.label;
    if (!name || name === s.callout.labelTextField.value) return;
    s.callout.labelText.value = name;        // reflect this frame (avoid a flash)
    s.callout.labelTextField.value = name;
    this.host.persistProperties({
      merge: [{
        objectName: "callout",
        selector: null,
        properties: { labelText: name, labelTextField: name },
      }],
    });
  }

  /** Gallery tile click: persist the chosen layout (+ its sub-type), close the gallery, leave focus. */
  private pickLayout(pick: LayoutPick): void {
    const properties: { [k: string]: string | boolean } = { stylePreset: pick.preset, showLayoutGallery: false };
    if (pick.trendType) properties.trendChartType = pick.trendType;
    if (pick.goalType) properties.goalTargetType = pick.goalType;
    this.host.persistProperties({ merge: [{ objectName: "cardStyle", selector: null, properties }] });
    this.host.switchFocusModeState(false);
  }

  /** Open the conditional-formatting rule editor in a modal dialog, seeded with the current config. */
  private openCfDialog(s: VisualFormattingSettingsModel, vm: KpiViewModel): void {
    const cs = s.cardStyle;
    const props = this.buildProps(s);
    const chrome = resolveChrome(props); // the preview card mirrors the card's resolved theme (surface + ink ramp), not the dialog chrome
    // The preview shows the author's REAL data (a snapshot at open — the modal blocks the report, so
    // it can't change mid-edit, but it reflects whatever filter/slicer was applied before opening). The
    // value is formatted with the SAME params as the card, so the preview matches the visual exactly.
    const valueFormatted = vm.valueIsBlank
      ? (resolveBlank(props.calloutShowBlankAs, props.calloutBlankText) || "—")
      : formatCallout(vm.valueRaw, vm.valueFormatString, props.displayUnits, props.decimals);
    // the Comparison Value, formatted with the SAME params as the card's compare row (so the preview matches)
    const comparisonValueFormatted = vm.comparisonIsBlank
      ? resolveBlank(props.cmpShowBlankAs, props.cmpBlankText)
      : formatCallout(vm.comparisonRaw, vm.comparisonFormat, props.cmpDisplayUnits, props.cmpDecimals);
    const initialState = {
      config: parseConfig(s.conditionalFormatting.config.value),
      preview: {
        preset: cs.stylePreset.value.value as string,
        trendType: cs.trendChartType.value.value as string,
        goalType: cs.goalTargetType.value.value as string,
        data: {
          label: props.calloutLabel || vm.label || "Value",
          valueFormatted,
          valueRaw: vm.valueRaw,
          valueIsBlank: vm.valueIsBlank,
          hasTrend: vm.hasTrend,
          trend: vm.trendValues || [],
          hasComparison: vm.hasComparison,
          deltaFraction: vm.deltaFraction,
          valueIsPercent: vm.valueIsPercent,
          deltaPoints: vm.deltaPoints,
          deltaDecimals: props.deltaValueDecimals,
          deltaLabel: props.comparisonLabel || (vm.comparisonName ? "vs " + vm.comparisonName : ""),
          showChange: props.showChange,
          showComparisonValue: props.showComparisonValue,
          comparisonValueFormatted,
          hasTarget: vm.hasTarget,
          targetRaw: vm.targetRaw,
          goalPct: (vm.hasTarget && vm.targetRaw) ? (vm.valueRaw / vm.targetRaw) * 100 : null,
          valueFormatString: vm.valueFormatString,
          displayUnits: props.displayUnits,
          decimals: props.decimals,
          locale: this.host.locale || "",
          cardSurface: chrome.surface,
          cardInk: chrome.inkVars["--ink"],
          cardInk2: chrome.inkVars["--ink-2"],
          cardMuted: chrome.inkVars["--muted"],
          cardFaint: chrome.inkVars["--faint"],
          cardLine: chrome.inkVars["--line"],
          cardRaise: chrome.inkVars["--bg"],
          cardPos: chrome.inkVars["--pos-text"],
          cardNeg: chrome.inkVars["--neg-text"],
          isReal: true,
        },
      },
    };
    const options = {
      title: "Conditional Formatting", // shown by the host (it may also prefix the visual name — host-controlled)
      size: { width: 940, height: 640 }, // two-column: editor + live preview (the design width)
      position: { type: VisualDialogPositionType.Center },
      actionButtons: [DialogAction.OK, DialogAction.Cancel],
    };
    this.cfDialogOpen = true;
    this.host.openModalDialog(CfEditorDialog.id, options, initialState)
      .then((result: ModalDialogResult) => this.onCfDialogClosed(result))
      .catch(() => this.resetCfEditorToggle()); // blocked / unsupported / dismissed → just unstick the toggle
  }

  /** Dialog closed: on OK/Close persist the edited config JSON (+ reset the toggle); on Cancel reset only. */
  private onCfDialogClosed(result: ModalDialogResult): void {
    this.cfDialogOpen = false;
    const apply = result.actionId === DialogAction.OK || result.actionId === DialogAction.Close;
    const st = result.resultState as CFConfig | undefined;
    if (!apply || !st) { this.resetCfEditorToggle(); return; }
    this.host.persistProperties({
      merge: [{
        objectName: "conditionalFormatting", selector: null,
        properties: { showEditor: false, config: serializeConfig(st) },
      }],
    });
  }

  /** Reset the "Edit rules" launcher back to off (so it can be flipped again, and never sticks "on"). */
  private resetCfEditorToggle(): void {
    this.cfDialogOpen = false;
    this.host.persistProperties({
      merge: [{ objectName: "conditionalFormatting", selector: null, properties: { showEditor: false } }],
    });
  }

  /** Contextual Format pane — show only the controls relevant to the current preset/options. */
  private applyPaneVisibility(s: VisualFormattingSettingsModel, vm: KpiViewModel): void {
    const preset = s.cardStyle.stylePreset.value.value as string;
    s.cardStyle.trendChartType.visible = preset === "trend";
    s.cardStyle.trendWindow.visible = preset === "trend";
    s.cardStyle.tooltipDateFormat.visible = preset === "trend";
    s.cardStyle.goalTargetType.visible = preset === "goal";
    s.cardStyle.targetLabel.visible = preset === "goal" && (s.cardStyle.goalTargetType.value.value === "fixed");
    // Border/Shadow contents are governed by their group header toggle (topLevelSlice) — no manual gating.

    // KPI Icon group: glyph + size show only when the KPI icon is on; menu size only when the menu is on.
    s.icon.glyph.visible = s.icon.show.value;
    s.icon.kpiIconSize.visible = s.icon.show.value;
    s.icon.menuIconSize.visible = s.icon.showMenu.value;

    // Callout: the custom blank text only matters when "Show blank as" = Custom.
    s.callout.blankText.visible = s.callout.showBlankAs.value.value === "custom";
    s.callout.labelTextField.visible = false; // hidden — internal tracker only

    // Comparison: when the card is on, the four sub-group HEADERS all show (Display · Change · Value · Label).
    // The Change and Value groups' formatting OPTIONS are gated by their Display toggle — a deselected part
    // shows no editable options (so you can't format the delta while "Change" is off, or the value while
    // "Value" is off). The Display toggles drive what RENDERS in the card; the header collapses the card.
    const showComp = s.delta.showComparison.value;
    const changeOn = showComp && s.delta.showChange.value;
    const valueOn = showComp && s.delta.showComparisonValue.value;
    s.delta.displayGroup.visible = showComp;
    s.delta.valueGroup.visible = showComp;            // "Change" header always shows when the card is on
    s.delta.comparisonValueGroup.visible = showComp;  // "Value" header always shows when the card is on
    s.delta.labelGroup.visible = showComp;            // "Label" — always available while the card is on
    // gate the Change and Value groups' options by their Display toggle. Label stays on: its caption ("vs …" /
    // the period) can render in BOTH change and value displays, so it's always available while the card is on.
    s.delta.valueGroup.slices?.forEach(sl => { sl.visible = changeOn; });
    s.delta.comparisonValueGroup.slices?.forEach(sl => { sl.visible = valueOn; });
    // custom blank text only when its group is on AND "Custom" is picked (overrides the blanket set above)
    s.delta.valueBlankText.visible = changeOn && s.delta.valueShowBlankAs.value.value === "custom";
    s.delta.cmpBlankText.visible = valueOn && s.delta.cmpShowBlankAs.value.value === "custom";
    s.delta.comparisonLabelField.visible = false; // hidden — internal tracker only (overrides the set above)
    s.delta.comparisonValueField.visible = false; // hidden — internal tracker only (overrides the set above)

    // CF editing lives entirely in the modal DIALOG. The pane shows only Enable + an "Edit rules" launcher;
    // the launcher appears once CF is enabled AND the host allows modal dialogs (the rich rule editor can't
    // be rendered inline — see the cf-rule-editor-dialog decision in CLAUDE.md). `config` is a hidden tracker.
    const cf = s.conditionalFormatting;
    const canDialog = !!(this.host.hostCapabilities && this.host.hostCapabilities.allowModalDialog);
    cf.showEditor.visible = canDialog && cf.enable.value;
    cf.config.visible = false;

    // Advanced → Custom fonts: hide the per-element overrides until the toggle is on.
    const customOn = s.advanced.customFontsEnable.value;
    s.advanced.customFontsNote.visible = customOn;
    s.advanced.calloutValueFont.visible = customOn;
    s.advanced.calloutLabelFont.visible = customOn;
    s.advanced.comparisonValueFont.visible = customOn;
    s.advanced.comparisonLabelFont.visible = customOn;
  }

  public getFormattingModel(): powerbi.visuals.FormattingModel {
    return this.formattingSettingsService.buildFormattingModel(this.settings);
  }
}
