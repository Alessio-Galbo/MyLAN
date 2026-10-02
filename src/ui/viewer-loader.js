/**
 * Riconnessione autonoma in background senza bloccare il caricamento dell'app dalla cache.
 */
import { getActiveChannel } from "../webrtc/channel.js";
import { reconnectPeer } from "../webrtc/reconnect.js";
import { hasShellHtml } from "../loader/html-patcher.js";
import { syncAppUpdate } from "./viewer-updater.js";

let isReconnecting = false;

export async function initBackgroundReconnect(iframe, appData) {
  const activeChan = getActiveChannel();
  if (activeChan && activeChan.readyState === "open") {
    try { iframe?.contentWindow?.postMessage({ type: "mylan:peer-connected" }, "*"); } catch {}
    return;
  }
  if (!appData?.reconnectToken || isReconnecting) return;
  isReconnecting = true;

  try {
    await reconnectPeer(appData.reconnectToken);
    if (!hasShellHtml()) {
      syncAppUpdate(iframe, appData);
    } else {
      try {
        const isFallback = !!iframe?.contentDocument?.querySelector?.('meta[name="mylan-fallback"]');
        const docText = iframe?.contentDocument?.body?.innerText || "";
        if (isFallback || docText.includes("DataChannel not ready") || docText.includes("503")) {
          iframe.src = appData.url || "./session/";
        }
        iframe?.contentWindow?.postMessage({ type: "mylan:peer-connected" }, "*");
      } catch {}
    }
  } catch (err) {
    console.warn("[MyLAN] Background reconnect failed:", err);
    try { iframe?.contentWindow?.postMessage({ type: "mylan:peer-disconnected" }, "*"); } catch {}
  } finally {
    isReconnecting = false;
  }
}
