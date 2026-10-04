/**
 * Visualizzatore a schermo intero per l'applicazione attiva collegata via P2P.
 */
import { saveApp } from "../storage/app-registry.js?v=e19f7df8665d";
import { initBackgroundReconnect, prepareAppSession } from "./viewer-loader.js?v=e19f7df8665d";
import { answerUpdateRequest } from "./viewer-updater.js?v=e19f7df8665d";
import { openFrame, healOnBootError } from "./viewer-heal.js?v=e19f7df8665d";
import { getAppSlug, setFavicon, restoreFavicon, adoptFrameIcon } from "./viewer-meta.js?v=e19f7df8665d";
import { applyAppManifest, restoreDefaultManifest } from "./pwa-manifest.js?v=e19f7df8665d";
import { watchViewer } from "./viewer-watchdog.js?v=e19f7df8665d";
import { sessionKeyOf } from "../loader/session-key.js?v=e19f7df8665d";
import { dropRuntimeEntries } from "../loader/runtime-rules.js?v=e19f7df8665d";

export { getAppSlug };

export function renderAppViewer(container, appData, onExit) {
  const viewer = document.createElement("div");
  viewer.className = "app-viewer-container";

  const prevTitle = document.title;
  const faviconEl = document.querySelector("link[rel*='icon']");
  const prevFavicon = faviconEl ? faviconEl.getAttribute("href") : "./favicon.svg";
  const prevType = faviconEl ? faviconEl.getAttribute("type") : "image/svg+xml";

  const sessionUrl = prepareAppSession(appData);
  if (appData.title) document.title = appData.title;
  if (appData.icon) setFavicon(faviconEl, appData.icon);
  // Aggiornamenti del manifest in coda: ognuno attende il precedente (icona in cache prima del <link>).
  let manifestJob = Promise.resolve();
  const syncManifest = () => (manifestJob = manifestJob.then(() => applyAppManifest(appData)).catch(() => {}));
  syncManifest();
  document.documentElement.classList.add("mylan-viewer-open");

  const slug = getAppSlug(appData);
  window.history.pushState({ mylanApp: slug }, "", `?app=${slug}`);

  const iframe = document.createElement("iframe");
  iframe.className = "viewer-iframe";
  iframe.setAttribute("allow", "autoplay; fullscreen; microphone; camera");
  viewer.appendChild(iframe);
  openFrame(iframe, appData, sessionUrl); // con il canale gia' aperto: prima l'eventuale aggiornamento, poi l'app

  const watchdog = watchViewer(iframe, appData); // ritorno all'host dopo una pausa della scheda o un canale morto
  iframe.addEventListener("load", () => adoptFrameIcon(iframe, appData, faviconEl, () => { syncManifest(); saveApp(appData); }));

  const onPopState = () => { cleanup(); onExit(); };

  const onMessage = (evt) => {
    if (evt.data?.type === "mylan:exit") {
      cleanup(); onExit();
    } else if (evt.data?.type === "mylan:request-reconnect") {
      watchdog.ensure(); // canale verificato (anche "aperto" ma muto) e, se serve, riconnessione
    } else if (evt.data?.type === "mylan:sync-update") {
      answerUpdateRequest(iframe, appData);
    } else if (evt.data?.type === "mylan:runtime-cache-drop" && evt.source === iframe.contentWindow) {
      dropRuntimeEntries(sessionKeyOf(appData), evt.data.paths); // solo la cache di runtime di questa app
    } else if (evt.data?.type === "mylan:app-boot-error" && evt.source === iframe.contentWindow) {
      healOnBootError(iframe, appData, evt.data.message);
    } else if (evt.data?.type === "mylan:register" && evt.data.meta) {
      const meta = evt.data.meta;
      if (meta.title) appData.title = meta.title;
      if (meta.icon && !appData.icon?.startsWith("http")) appData.icon = meta.icon;
      saveApp({ ...appData });
      if (meta.title) document.title = meta.title;
      if (appData.icon) setFavicon(faviconEl, appData.icon);
      syncManifest();
    }
  };

  const onMeta = (evt) => { if (evt.detail?.id === appData.id) syncManifest(); }; // icone/colori nuovi dall'host
  window.addEventListener("message", onMessage);
  window.addEventListener("popstate", onPopState);
  window.addEventListener("mylan:app-meta", onMeta);

  function cleanup() {
    watchdog.stop();
    window.removeEventListener("message", onMessage);
    window.removeEventListener("popstate", onPopState);
    window.removeEventListener("mylan:app-meta", onMeta);
    document.title = prevTitle;
    restoreFavicon(faviconEl, prevFavicon, prevType);
    restoreDefaultManifest();
    document.documentElement.classList.remove("mylan-viewer-open");
    window.history.replaceState({}, document.title, window.location.pathname);
    viewer.remove();
  }

  container.append(viewer);
  initBackgroundReconnect(iframe, appData);
  return { cleanup, manifestReady: () => manifestJob };
}
