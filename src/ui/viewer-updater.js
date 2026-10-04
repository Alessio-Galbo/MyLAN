/**
 * Aggiornamento della copia in cache dell'app aperta: sempre in background, uno alla volta per app, mai a cache vuota.
 * Parte dopo ogni (ri)connessione all'host e quando l'app lo chiede ("mylan:sync-update"). Se la versione dell'host
 * (app-updater.js) e' diversa da quella in cache, i file vengono riscaricati e l'iframe riceve "mylan:app-updated":
 * l'app sceglie quando ricaricarsi (senza gestore la nuova versione si vede alla prossima apertura). Prima ogni
 * richiesta svuotava la cache e ricaricava l'iframe: un'app che la chiedeva a ogni avvio girava in tondo.
 */
import { getActiveChannel, getApiChannel, getChannelOwner } from "../webrtc/channel.js?v=76b805b937bb";
import { downloadAppBundle } from "../loader/app-downloader.js?v=76b805b937bb";
import { sessionKeyOf, sessionBaseUrl } from "../loader/session-key.js?v=76b805b937bb";
import { hostVersion, storedVersion } from "../loader/app-updater.js?v=76b805b937bb";
import { hasShellHtml } from "../loader/html-patcher.js?v=76b805b937bb";
import { ensureRuntimeRules } from "../loader/runtime-rules.js?v=76b805b937bb";
import { saveApp } from "../storage/app-registry.js?v=76b805b937bb";

const running = new Map();

function ownChannel(appKey) {
  const ch = getApiChannel() || getActiveChannel();
  return ch && ch.readyState === "open" && getChannelOwner() === appKey ? ch : null;
}

/** true: copia aggiornata; false: gia' aggiornata; null: host non raggiungibile ora. */
export function checkAppUpdate(iframe, appData) {
  const appKey = sessionKeyOf(appData);
  if (!running.has(appKey)) running.set(appKey, run(iframe, appData, appKey).finally(() => running.delete(appKey)));
  return running.get(appKey);
}

async function run(iframe, appData, appKey) {
  const channel = ownChannel(appKey);
  if (!channel) return null;
  const keepMeta = (m) => { appData.updateCheck = m.updateCheck; saveApp({ ...appData }); };
  try {
    if (!hasShellHtml(appKey)) { // copia mai completata: scaricamento completo, poi apertura
      await downloadAppBundle(channel, appKey, () => {}, keepMeta, true);
      if (iframe) iframe.src = sessionBaseUrl(appKey);
      return true;
    }
    ensureRuntimeRules(channel, appKey); // app salvate prima di "runtime_cache": regole lette una volta
    const now = await hostVersion(channel, appData.updateCheck);
    if (!now) return null;
    if (now === storedVersion(appKey)) return false;
    await downloadAppBundle(channel, appKey, () => {}, keepMeta, false);
    if (iframe) notifyUpdated(iframe, appKey);
    return true;
  } catch (err) {
    console.warn("[MyLAN] Update sync failed:", err);
    return null;
  }
}

// "mylan:app-updated" all'app; se entro ACK_MS non conferma ("mylan:app-updated-ack") ne' si ricarica, l'app e'
// bloccata (es. non e' partita): la ricarica MyLAN dalla copia appena aggiornata.
const ACK_MS = 5000;
function notifyUpdated(iframe, appKey) {
  let acked = false;
  const onAck = (e) => { if (e.data?.type === "mylan:app-updated-ack" && e.source === iframe.contentWindow) acked = true; };
  const onLoad = () => { acked = true; };
  window.addEventListener("message", onAck);
  iframe.addEventListener("load", onLoad, { once: true });
  try { iframe.contentWindow?.postMessage({ type: "mylan:app-updated" }, "*"); } catch {}
  setTimeout(() => {
    window.removeEventListener("message", onAck);
    iframe.removeEventListener("load", onLoad);
    if (!acked && iframe.isConnected) iframe.src = sessionBaseUrl(appKey);
  }, ACK_MS);
}

/** L'app ha chiesto un controllo ("mylan:sync-update"): esito in "mylan:update-result" {changed: true|false|null}. */
export async function answerUpdateRequest(iframe, appData) {
  const changed = await checkAppUpdate(iframe, appData);
  try { iframe?.contentWindow?.postMessage({ type: "mylan:update-result", changed }, "*"); } catch {}
}
