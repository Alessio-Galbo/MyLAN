/**
 * Orchestratore principale dell'applicazione MyLAN: hub, portale e visualizzatore.
 */
import { initI18n } from "./core/i18n.js?v=aa3afb9e1dd9";
import { initTheme } from "./core/theme.js?v=aa3afb9e1dd9";
import { renderTopBar } from "./ui/top-bar.js?v=aa3afb9e1dd9";
import { renderPortal } from "./ui/portal-view.js?v=aa3afb9e1dd9";
import { renderAppHub } from "./ui/app-hub.js?v=aa3afb9e1dd9";
import { renderAppViewer } from "./ui/app-viewer.js?v=aa3afb9e1dd9";
import { extractCodeFromUrl } from "./ui/code-input.js?v=aa3afb9e1dd9";
import { initServiceWorkerBridge } from "./loader/sw-bridge.js?v=aa3afb9e1dd9";
import { getSavedApps, findAppByQuery } from "./storage/app-registry.js?v=aa3afb9e1dd9";
import { connectAndSyncApp } from "./core/launcher.js?v=aa3afb9e1dd9";
import { migrateLegacyStorage } from "./storage/app-cleanup.js?v=aa3afb9e1dd9";

let contentContainer = null;
let activeViewer = null;

function handleConnect(code, statusCard, onFinish) {
  connectAndSyncApp(code, statusCard, contentContainer, launchViewer, onFinish);
}

function launchViewer(appData) {
  const root = document.getElementById("app-root");
  if (!root) return;
  if (contentContainer) contentContainer.style.display = "none";
  activeViewer = renderAppViewer(root, appData, () => {
    activeViewer = null;
    if (contentContainer) {
      contentContainer.style.display = "flex";
      showHubOrConnect();
    }
  });
}

function showHubOrConnect() {
  if (!contentContainer) return;
  contentContainer.innerHTML = "";
  const query = new URLSearchParams(window.location.search).get("app");
  const directApp = findAppByQuery(query);
  if (directApp) {
    launchViewer(directApp);
    return;
  }

  const saved = getSavedApps();
  const code = extractCodeFromUrl();
  if (code && code.replace(/[^A-Za-z0-9]/g, "").length === 12) {
    renderPortal(contentContainer, handleConnect);
  } else if (saved.length > 0) {
    renderAppHub(
      contentContainer,
      (app) => launchViewer(app),
      () => {
        contentContainer.innerHTML = "";
        renderPortal(contentContainer, handleConnect);
      }
    );
  } else {
    renderPortal(contentContainer, handleConnect);
  }
}

async function init() {
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches ||
                       window.matchMedia("(display-mode: fullscreen)").matches ||
                       window.navigator.standalone === true;
  if (isStandalone) document.body.classList.add("is-standalone");
  initTheme();
  await initI18n();
  migrateLegacyStorage(getSavedApps());
  initServiceWorkerBridge();
  const root = document.getElementById("app-root");
  if (root) {
    if (!isStandalone) renderTopBar(root);
    contentContainer = document.createElement("div");
    contentContainer.className = "portal-content";
    root.appendChild(contentContainer);
    showHubOrConnect();
  }
}

// Caricato da src/boot.js dopo version.json: la pagina puo' essere gia' pronta.
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
