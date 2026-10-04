/**
 * Componente per i badge e indicatori delle funzionalità del portale.
 */
import { t } from "../core/i18n.js?v=e19f7df8665d";
import { ICON_LOCK, ICON_ZAP } from "./icons.js?v=e19f7df8665d";

export function createFeaturePills() {
  const el = document.createElement("div");
  el.className = "portal-features";
  el.innerHTML = '<span class="feat-pill"><span class="feat-icon">' + ICON_LOCK + '</span><span id="feat-1">' + t("portal.feature_e2e") + '</span></span>' +
    '<span class="feat-pill"><span class="feat-icon">' + ICON_ZAP + '</span><span id="feat-2">' + t("portal.feature_direct") + '</span></span>';

  return {
    el,
    updateText: () => {
      const f1 = document.getElementById("feat-1");
      if (f1) f1.textContent = t("portal.feature_e2e");
      const f2 = document.getElementById("feat-2");
      if (f2) f2.textContent = t("portal.feature_direct");
    }
  };
}
