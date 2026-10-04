/**
 * Schermata Hub / Indice delle applicazioni salvate e selezione rapida.
 */
import { t, onLangChange } from "../core/i18n.js?v=e19f7df8665d";
import { getSavedApps, getApp, removeApp, touchApp } from "../storage/app-registry.js?v=e19f7df8665d";
import { purgeAppData } from "../storage/app-cleanup.js?v=e19f7df8665d";
import { createAppCard } from "./app-card.js?v=e19f7df8665d";

export function renderAppHub(container, onLaunchApp, onShowConnect) {
  container.innerHTML = "";
  const hub = document.createElement("div");
  hub.className = "app-hub-card";

  const header = document.createElement("div");
  header.className = "hub-header";
  const title = document.createElement("h2");
  title.className = "hub-title";
  title.textContent = t("hub.title");
  const subtitle = document.createElement("p");
  subtitle.className = "hub-subtitle";
  subtitle.textContent = t("hub.subtitle");
  header.append(title, subtitle);

  const list = document.createElement("div");
  list.className = "hub-list";

  const refreshList = () => {
    list.innerHTML = "";
    const apps = getSavedApps();
    if (apps.length === 0) {
      onShowConnect();
      return;
    }
    apps.forEach((app) => {
      const card = createAppCard(
        app,
        (selected) => {
          touchApp(selected.id);
          onLaunchApp(selected);
        },
        (idToRemove) => {
          purgeAppData(getApp(idToRemove));
          removeApp(idToRemove);
          refreshList();
        }
      );
      list.appendChild(card);
    });
  };

  refreshList();

  const actions = document.createElement("div");
  actions.className = "hub-actions";
  const newBtn = document.createElement("button");
  newBtn.type = "button";
  newBtn.className = "btn-secondary";
  newBtn.textContent = "+ " + t("hub.new_connect");
  newBtn.addEventListener("click", onShowConnect);
  actions.append(newBtn);

  hub.append(header, list, actions);
  container.append(hub);

  onLangChange(() => {
    title.textContent = t("hub.title");
    subtitle.textContent = t("hub.subtitle");
    newBtn.textContent = "+ " + t("hub.new_connect");
    refreshList();
  });
}
