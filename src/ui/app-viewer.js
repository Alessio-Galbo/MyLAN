/**
 * Visualizzatore a schermo intero per l'applicazione attiva collegata via P2P.
 */
import { saveApp } from "../storage/app-registry.js";
import { initBackgroundReconnect } from "./viewer-loader.js";
import { syncAppUpdate } from "./viewer-updater.js";
import { getAppSlug, setFavicon, restoreFavicon } from "./viewer-meta.js";
import { applyAppManifest, restoreDefaultManifest } from "./pwa-manifest.js";

export { getAppSlug };

export function renderAppViewer(container, appData, onExit) {
  const viewer = document.createElement("div");
  viewer.className = "app-viewer-container";

  const prevTitle = document.title;
  const faviconEl = document.querySelector("link[rel*='icon']");
  const prevFavicon = faviconEl ? faviconEl.getAttribute("href") : "./favicon.svg";
  const prevType = faviconEl ? faviconEl.getAttribute("type") : "image/svg+xml";

  if (appData.title) document.title = appData.title;
  if (appData.icon) setFavicon(faviconEl, appData.icon);
  applyAppManifest(appData);

  const slug = getAppSlug(appData);
  window.history.pushState({ mylanApp: slug }, "", `?app=${slug}`);

  const iframe = document.createElement("iframe");
  iframe.className = "viewer-iframe";
  iframe.setAttribute("allow", "autoplay; fullscreen; microphone; camera");
  iframe.src = appData.url || "./session/";
  viewer.appendChild(iframe);

  iframe.addEventListener("load", () => {
    try {
      const doc = iframe.contentDocument;
      const link = doc?.querySelector?.("link[rel*='icon']");
      if (link?.href && (!appData.icon || appData.icon.startsWith("<svg")) && !link.href.includes("/session/")) {
        appData.icon = link.href;
        setFavicon(faviconEl, appData.icon);
        applyAppManifest(appData);
        saveApp(appData);
      }
    } catch {}
  });

  const onPopState = () => { cleanup(); onExit(); };

  const onMessage = (evt) => {
    if (evt.data?.type === "mylan:exit") {
      cleanup(); onExit();
    } else if (evt.data?.type === "mylan:request-reconnect") {
      initBackgroundReconnect(iframe, appData);
    } else if (evt.data?.type === "mylan:sync-update") {
      syncAppUpdate(iframe, appData);
    } else if (evt.data?.type === "mylan:register" && evt.data.meta) {
      const meta = evt.data.meta;
      if (meta.title) appData.title = meta.title;
      if (meta.icon && !appData.icon?.startsWith("http")) appData.icon = meta.icon;
      saveApp({ ...appData });
      if (meta.title) document.title = meta.title;
      if (appData.icon) setFavicon(faviconEl, appData.icon);
      applyAppManifest(appData);
    }
  };

  window.addEventListener("message", onMessage);
  window.addEventListener("popstate", onPopState);

  function cleanup() {
    window.removeEventListener("message", onMessage);
    window.removeEventListener("popstate", onPopState);
    document.title = prevTitle;
    restoreFavicon(faviconEl, prevFavicon, prevType);
    restoreDefaultManifest();
    window.history.replaceState({}, document.title, window.location.pathname);
    viewer.remove();
  }

  container.append(viewer);
  initBackgroundReconnect(iframe, appData);
  return { cleanup };
}
