/**
 * Preparazione della sessione dell'app aperta e riconnessione in background senza bloccare la cache.
 * Il canale aperto vale solo per l'app che lo possiede: aprendo un'altra app si riconnette al suo host.
 */
import { getActiveChannel, getChannelOwner, setWantedOwner } from "../webrtc/channel.js";
import { reconnectPeer } from "../webrtc/reconnect.js";
import { hasShellHtml } from "../loader/html-patcher.js";
import { sessionKeyOf, sessionBaseUrl } from "../loader/session-key.js";
import { setMediaPaths } from "../loader/sw-channel-selector.js";
import { setChunkedUploads } from "../loader/channel-body.js";
import { checkAppUpdate } from "./viewer-updater.js";

const reconnecting = new Set();

/** Imposta instradamento e caricamenti dell'app e restituisce l'URL del suo spazio /session/<chiave>/. */
export function prepareAppSession(appData) {
  const appKey = sessionKeyOf(appData);
  setWantedOwner(appKey);
  setMediaPaths(appData.mediaPaths);
  setChunkedUploads(appData.chunkedUploads);
  return sessionBaseUrl(appKey);
}

export async function initBackgroundReconnect(iframe, appData) {
  const appKey = sessionKeyOf(appData);
  const activeChan = getActiveChannel();
  if (activeChan && activeChan.readyState === "open" && getChannelOwner() === appKey) {
    try { iframe?.contentWindow?.postMessage({ type: "mylan:peer-connected" }, "*"); } catch {}
    return;
  }
  if (!appData?.reconnectToken || reconnecting.has(appKey)) return;
  reconnecting.add(appKey);

  try {
    await reconnectPeer(appData.reconnectToken, appKey);
    if (hasShellHtml(appKey)) {
      try {
        const isFallback = !!iframe?.contentDocument?.querySelector?.('meta[name="mylan-fallback"]');
        const docText = iframe?.contentDocument?.body?.innerText || "";
        if (isFallback || docText.includes("DataChannel not ready") || docText.includes("503")) {
          iframe.src = sessionBaseUrl(appKey);
        }
        iframe?.contentWindow?.postMessage({ type: "mylan:peer-connected" }, "*");
      } catch {}
    }
    checkAppUpdate(iframe, appData); // in background: l'app resta quella in cache finche' non e' pronta la nuova

  } catch (err) {
    console.warn("[MyLAN] Background reconnect failed:", err);
    try { iframe?.contentWindow?.postMessage({ type: "mylan:peer-disconnected" }, "*"); } catch {}
  } finally {
    reconnecting.delete(appKey);
  }
}
