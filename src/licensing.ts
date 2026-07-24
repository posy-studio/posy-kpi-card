/*
 *  License enforcement — the visual is sold through Microsoft (transactable AppSource offer).
 *
 *  Model (decided 2026-07-24): FULL BLOCK without a usable license — the host draws its
 *  "license required" overlay (with the Get-a-license button) over a blanked visual — and
 *  LENIENT wherever licensing cannot be checked: unsupported environments (publish-to-web,
 *  embedded, Report Server, PDF/PPT export) and unavailable license info (signed-out or
 *  offline Desktop, transient service failure) render normally, so a paying customer's
 *  exports and offline authoring never break.
 *
 *  All calls are host-side (no external requests) — certification-safe.
 */
"use strict";

import powerbi from "powerbi-visuals-api";

import IVisualLicenseManager = powerbi.extensibility.IVisualLicenseManager;
import LicenseInfoResult = powerbi.extensibility.visual.LicenseInfoResult;
import ServicePlanState = powerbi.ServicePlanState;
import LicenseNotificationType = powerbi.LicenseNotificationType;

/** pending = plans not yet retrieved (render normally until resolved). */
export type LicenseState = "pending" | "licensed" | "unlicensed" | "lenient";

export class LicenseGate {
  private state: LicenseState = "pending";
  private notified = false; // the host overlay is currently requested (mirror, so we can clear it)

  constructor(private manager: IVisualLicenseManager | undefined, onResolve: () => void) {
    // A host without a license manager can't check licenses at all — same lenient posture
    // as an unsupported environment.
    if (!manager || typeof manager.getAvailableServicePlans !== "function") {
      this.state = "lenient";
      return;
    }
    // Fetch once here (cached host-side for the session); every update() re-reads this.state.
    manager.getAvailableServicePlans()
      .then((r: LicenseInfoResult) => {
        if (r.isLicenseUnsupportedEnv || !r.isLicenseInfoAvailable) {
          this.state = "lenient";
        } else {
          // Only Active/Warning are usable states; the plans array is already scoped to THIS visual.
          const usable = (r.plans || []).some(p => p.state === ServicePlanState.Active || p.state === ServicePlanState.Warning);
          this.state = usable ? "licensed" : "unlicensed";
        }
        onResolve();
      })
      .catch(() => { this.state = "lenient"; onResolve(); }); // retrieval failure must never block a render
  }

  /** False only when we positively know the user has no usable license — caller blanks the DOM
   *  (the host overlay covers the visual, but nothing of the card should linger underneath). */
  allowRender(): boolean { return this.state !== "unlicensed"; }

  /** Keep the host-drawn notification in sync with the resolved state; call every update().
   *  Both calls are best-effort — the host returns false where the notification doesn't apply. */
  syncNotification(): void {
    if (!this.manager) return;
    if (this.state === "unlicensed") {
      this.manager.notifyLicenseRequired(LicenseNotificationType.VisualIsBlocked)
        .then((shown) => { this.notified = this.notified || !!shown; })
        .catch(() => { /* host-side, non-fatal */ });
    } else if (this.notified) {
      this.manager.clearLicenseNotification().catch(() => { /* host-side, non-fatal */ });
      this.notified = false;
    }
  }
}
