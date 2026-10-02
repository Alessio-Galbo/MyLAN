/**
 * Componente pulsante di supporto Ko-fi per MyLAN.
 */
import { t } from "../core/i18n.js";

const KOFI_URL = "https://ko-fi.com/devangel";

export function createKofiButton() {
  const link = document.createElement("a");
  link.href = KOFI_URL;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.className = "kofi-btn";
  link.title = t("nav.support_kofi");
  link.setAttribute("aria-label", t("nav.support_kofi"));

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "kofi-icon");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = '<path fill="currentColor" d="M23.88 8.95c-.77-4.09-4.86-4.59-4.86-4.59H.72c-.6 0-.68.8-.68.8s-.08 7.32-.02 11.82c.16 2.42 2.59 2.67 2.59 2.67s8.26-.02 11.96-.05c2.44-.43 2.69-2.57 2.66-3.73 4.35.24 7.42-2.83 6.65-6.92zm-11.02 5.04c-1.68 1.34-4.84.01-4.84.01s-1.84 1.49-3.16-.01c-1.34-1.52.52-3.41.52-3.41s1.82-1.46 3.74.52c1.88-1.99 3.74-.52 3.74-.52s1.86 1.89-.01 3.41zm7.39-2.08c-.28 1.49-1.55 1.86-2.92 1.88l-.02-3.83c1.38.02 3.22.47 2.94 1.95z"/>';

  const label = document.createElement("span");
  label.className = "kofi-label";
  label.textContent = t("nav.support_kofi");

  link.append(svg, label);

  return {
    el: link,
    updateText: () => {
      label.textContent = t("nav.support_kofi");
      link.title = t("nav.support_kofi");
      link.setAttribute("aria-label", t("nav.support_kofi"));
    }
  };
}
