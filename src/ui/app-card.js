/**
 * Componente card per ciascuna applicazione salvata nel registro MyLAN.
 */
import { t } from "../core/i18n.js?v=aa3afb9e1dd9";
import { ICON_GLOBE, ICON_CLOSE } from "./icons.js?v=aa3afb9e1dd9";

export function createAppCard(app, onLaunch, onRemove) {
  const card = document.createElement("div");
  card.className = "hub-app-card";

  const iconWrap = document.createElement("div");
  iconWrap.className = "hub-card-icon";
  const rawIcon = (app.icon || "").trim();
  if (rawIcon.startsWith("<svg")) {
    iconWrap.innerHTML = rawIcon;
  } else if (rawIcon) {
    const img = document.createElement("img");
    img.className = "hub-card-img";
    img.src = rawIcon;
    img.alt = app.title || "App";
    img.onerror = () => { iconWrap.innerHTML = ICON_GLOBE; };
    iconWrap.appendChild(img);
  } else {
    iconWrap.innerHTML = ICON_GLOBE;
  }

  const meta = document.createElement("div");
  meta.className = "hub-card-meta";
  const title = document.createElement("h3");
  title.className = "hub-card-title";
  title.textContent = app.title || "Web Application";

  const date = document.createElement("span");
  date.className = "hub-card-date";
  date.textContent = t("hub.last_used") + ": " + new Date(app.lastUsed).toLocaleDateString();

  if (app.description) {
    const desc = document.createElement("p");
    desc.className = "hub-card-desc";
    desc.textContent = app.description;
    meta.append(title, desc, date);
  } else {
    meta.append(title, date);
  }

  const actions = document.createElement("div");
  actions.className = "hub-card-actions";

  const openBtn = document.createElement("button");
  openBtn.type = "button";
  openBtn.className = "hub-open-btn";
  openBtn.textContent = t("hub.open_btn");
  openBtn.addEventListener("click", () => onLaunch(app));

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "hub-remove-btn";
  deleteBtn.innerHTML = ICON_CLOSE;
  deleteBtn.title = t("hub.remove_btn");
  deleteBtn.setAttribute("aria-label", t("hub.remove_btn"));
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onRemove(app.id);
  });

  actions.append(openBtn, deleteBtn);
  card.append(iconWrap, meta, actions);
  return card;
}
