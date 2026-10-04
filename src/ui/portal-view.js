/**
 * Assemblatore della vista principale del portale MyLAN con aggiornamento reattivo.
 */
import { t, onLangChange } from "../core/i18n.js?v=e19f7df8665d";
import { createCodeInput, extractCodeFromUrl, inviteProtocolFromUrl } from "./code-input.js?v=e19f7df8665d";
import { createStatusCard } from "./status-card.js?v=e19f7df8665d";
import { createFeaturePills } from "./portal-features.js?v=e19f7df8665d";

export function renderPortal(container, onConnect) {
  const card = document.createElement("div");
  card.className = "portal-card";

  const badge = document.createElement("div");
  badge.className = "portal-badge";
  badge.innerHTML = '<span class="badge-dot"></span><span id="badge-text">' + t("portal.badge") + '</span>';

  const header = document.createElement("div");
  header.className = "portal-header";
  const brand = document.createElement("h1");
  brand.className = "portal-brand";
  brand.innerHTML = 'My<span class="brand-gradient">LAN</span>';
  const subtitle = document.createElement("p");
  subtitle.className = "portal-subtitle";
  subtitle.textContent = t("app.subtitle");
  header.append(brand, subtitle);

  const form = document.createElement("form");
  form.className = "code-form";

  const fieldWrap = document.createElement("div");
  fieldWrap.className = "code-field-wrap";
  const label = document.createElement("label");
  label.className = "field-label";
  label.textContent = t("portal.code_label");

  const initialCode = extractCodeFromUrl();
  const linkProtocol = inviteProtocolFromUrl(); // letto ora: l'URL si pulisce alla connessione
  const input = createCodeInput(initialCode);
  fieldWrap.append(label, input);

  const statusCard = createStatusCard();

  const btn = document.createElement("button");
  btn.type = "submit";
  btn.className = "btn-primary";
  btn.textContent = t("portal.connect_btn");

  const features = createFeaturePills();
  form.append(fieldWrap, btn, statusCard.el, features.el);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = input.value.replace(/[^A-Za-z0-9]/g, "");
    if (raw.length !== 12) {
      statusCard.update(t("portal.invalid_code"), "error");
      return;
    }
    btn.disabled = true;
    input.disabled = true;
    const sameAsLink = raw === initialCode.replace(/[^A-Za-z0-9]/g, "");
    onConnect(raw, statusCard, () => {
      btn.disabled = false;
      input.disabled = false;
    }, sameAsLink ? linkProtocol : 2);
  });

  const footer = document.createElement("footer");
  footer.className = "portal-footer";
  footer.textContent = t("portal.powered_by");

  card.append(badge, header, form);
  container.append(card, footer);

  onLangChange(() => {
    const b = document.getElementById("badge-text");
    if (b) b.textContent = t("portal.badge");
    subtitle.textContent = t("app.subtitle");
    label.textContent = t("portal.code_label");
    btn.textContent = t("portal.connect_btn");
    features.updateText();
    footer.textContent = t("portal.powered_by");
  });

  if (initialCode && initialCode.replace(/[^A-Za-z0-9]/g, "").length === 12) {
    btn.click();
  }
}
