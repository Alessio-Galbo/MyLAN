/**
 * Logica di connessione, sincronizzazione P2P e lancio dell'applicazione.
 */
import { t } from "./i18n.js?v=76b805b937bb";
import { executeHandshake } from "../webrtc/handshake.js?v=76b805b937bb";
import { downloadAppBundle } from "../loader/app-downloader.js?v=76b805b937bb";
import { saveApp } from "../storage/app-registry.js?v=76b805b937bb";
import { createSyncProgress } from "../ui/sync-progress.js?v=76b805b937bb";
import { clearUrlParams } from "../ui/code-input.js?v=76b805b937bb";
import { sessionKeyOf } from "../loader/session-key.js?v=76b805b937bb";

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
