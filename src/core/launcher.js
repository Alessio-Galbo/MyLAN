/**
 * Logica di connessione, sincronizzazione P2P e lancio dell'applicazione.
 */
import { t } from "./i18n.js?v=1669042733e9";
import { executeHandshake } from "../webrtc/handshake.js?v=1669042733e9";
import { downloadAppBundle } from "../loader/app-downloader.js?v=1669042733e9";
import { saveApp } from "../storage/app-registry.js?v=1669042733e9";
import { createSyncProgress } from "../ui/sync-progress.js?v=1669042733e9";
import { clearUrlParams } from "../ui/code-input.js?v=1669042733e9";
import { sessionKeyOf } from "../loader/session-key.js?v=1669042733e9";

export async function connectAndSyncApp(code, statusCard, container, onReady, onError, protocol = 2) {
  clearUrlParams();
  try {
    const { channel, reconnectToken } = await executeHandshake(code, (msg, type) => statusCard?.update(msg, type),
      protocol);
    container.innerHTML = "";
    const syncCard = createSyncProgress();
    container.appendChild(syncCard.el);

    const res = await downloadAppBundle(
      channel,
      sessionKeyOf({ id: code }),
      (pct, txt) => syncCard.setProgress(pct, txt),
      (meta) => syncCard.setAppInfo(meta)
    );

    const appData = {
      id: code,
      code,
      reconnectToken,
      title: res?.metadata?.name || ("Web App (" + code.slice(0, 4) + ")"),
      description: res?.metadata?.description || "",
      icon: res?.metadata?.icon || "",
      themeColor: res?.metadata?.themeColor || "",
      backgroundColor: res?.metadata?.backgroundColor || "",
      icons: res?.metadata?.icons, // assenti se lo scaricamento non è riuscito: riprovate alla connessione dopo
      mediaPaths: res?.metadata?.mediaPaths || [],
      chunkedUploads: Boolean(res?.metadata?.chunkedUploads),
      websocket: Boolean(res?.metadata?.websocket),
      updateCheck: res?.metadata?.updateCheck || null
    };
    saveApp(appData);
    onReady(appData);
  } catch (err) {
    statusCard?.update(err.message || t("portal.rejected"), "error");
    if (onError) onError();
  }
}
