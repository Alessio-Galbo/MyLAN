/**
 * Componente per la schermata di download e sincronizzazione con progress bar.
 */
import { t } from "../core/i18n.js?v=76b805b937bb";
import { ICON_ZAP } from "./icons.js?v=76b805b937bb";

export function createSyncProgress() {
  const card = document.createElement("div");
  card.className = "sync-progress-card";

  const iconWrap = document.createElement("div");
  iconWrap.className = "sync-icon-pulse";
  iconWrap.innerHTML = ICON_ZAP;

  const title = document.createElement("h2");
  title.className = "sync-title";
  title.textContent = t("sync.title");

  const subtitle = document.createElement("p");
  subtitle.className = "sync-subtitle";
  subtitle.textContent = t("sync.subtitle");

  const barTrack = document.createElement("div");
  barTrack.className = "sync-bar-track";
  const barFill = document.createElement("div");
  barFill.className = "sync-bar-fill";
  barFill.style.width = "0%";
  barTrack.appendChild(barFill);

  const metaRow = document.createElement("div");
  metaRow.className = "sync-meta-row";
  const percentLabel = document.createElement("span");
  percentLabel.className = "sync-percent";
  percentLabel.textContent = "0%";
  const statusLabel = document.createElement("span");
  statusLabel.className = "sync-status-text";
  statusLabel.textContent = t("sync.status") + "0 / 0";
  metaRow.append(statusLabel, percentLabel);

  card.append(iconWrap, title, subtitle, barTrack, metaRow);

  return {
    el: card,
    setAppInfo: (info) => {
      if (!info) return;
      if (info.name) title.textContent = info.name;
      if (info.description) subtitle.textContent = info.description;
      if (info.icon) {
        iconWrap.innerHTML = "";
        const rawIcon = info.icon.trim();
        if (rawIcon.startsWith("<svg")) {
          iconWrap.innerHTML = rawIcon;
        } else {
          const img = document.createElement("img");
          img.className = "sync-custom-icon";
          img.src = rawIcon;
          img.alt = info.name || "App Icon";
          img.onerror = () => { iconWrap.innerHTML = ICON_ZAP; };
          iconWrap.appendChild(img);
        }
      }
      if (info.themeColor) card.style.setProperty("--sync-accent", info.themeColor);
    },
    setProgress: (pct, text) => {
      const clamped = Math.min(Math.max(Math.round(pct), 0), 100);
      barFill.style.width = clamped + "%";
      percentLabel.textContent = clamped + "%";
      if (text) statusLabel.textContent = text;
    }
  };
}
