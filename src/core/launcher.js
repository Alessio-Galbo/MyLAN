/**
 * Logica di connessione, sincronizzazione P2P e lancio dell'applicazione.
 */
import { t } from "./i18n.js?v=aa3afb9e1dd9";
import { executeHandshake } from "../webrtc/handshake.js?v=aa3afb9e1dd9";
import { downloadAppBundle } from "../loader/app-downloader.js?v=aa3afb9e1dd9";
import { saveApp } from "../storage/app-registry.js?v=aa3afb9e1dd9";
import { createSyncProgress } from "../ui/sync-progress.js?v=aa3afb9e1dd9";
import { clearUrlParams } from "../ui/code-input.js?v=aa3afb9e1dd9";
import { sessionKeyOf } from "../loader/session-key.js?v=aa3afb9e1dd9";

export async function connectAndSyncApp(code, statusCard, container, onReady, onError) {
  clearUrlParams();
  try {
    const { channel, reconnectToken } = await executeHandshake(code, (msg, type) => statusCard?.update(msg, type));
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
      icons: res?.metadata?.icons || [],
      mediaPaths: res?.metadata?.mediaPaths || [],
      chunkedUploads: Boolean(res?.metadata?.chunkedUploads),
      updateCheck: res?.metadata?.updateCheck || null
    };
    saveApp(appData);
    onReady(appData);
  } catch (err) {
    statusCard?.update(err.message || t("portal.rejected"), "error");
    if (onError) onError();
  }
}
