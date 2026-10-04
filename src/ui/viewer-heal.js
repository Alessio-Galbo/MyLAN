/**
 * Copia in cache sempre coerente con l'host (mai file vecchi mescolati a file nuovi):
 * - openFrame: con il canale dell'app gia' aperto, l'aggiornamento (se la versione e' diversa o sconosciuta) avviene
 *   PRIMA di caricare l'iframe; senza canale l'app parte dalla cache cosi' com'e'.
 * - healOnBootError: l'app non e' partita ("mylan:app-boot-error" dallo script di sandbox-bridge.js). Una sola volta per
 *   app e per sessione: copia completa e coerente dall'host (tutti i file noti + pagina iniziale, sostituzione solo a
 *   scaricamento riuscito), poi ricarica dell'iframe. Host non raggiungibile: avviso chiaro nel visualizzatore.
 */
import { t } from "../core/i18n.js?v=aa3afb9e1dd9";
import { getActiveChannel, getApiChannel, getChannelOwner } from "../webrtc/channel.js?v=aa3afb9e1dd9";
import { isReconnecting } from "../webrtc/reconnect.js?v=aa3afb9e1dd9";
import { downloadAppBundle } from "../loader/app-downloader.js?v=aa3afb9e1dd9";
import { sessionKeyOf, sessionBaseUrl } from "../loader/session-key.js?v=aa3afb9e1dd9";
import { checkAppUpdate } from "./viewer-updater.js?v=aa3afb9e1dd9";
import { saveApp } from "../storage/app-registry.js?v=aa3afb9e1dd9";

const healed = new Set();

function ownChannel(appKey) {
  const ch = getApiChannel() || getActiveChannel();
  return ch && ch.readyState === "open" && getChannelOwner() === appKey ? ch : null;
}

/** Il canale dell'app, aspettando una riconnessione gia' in corso (al massimo maxMs). */
async function channelFor(appKey, maxMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const ch = ownChannel(appKey);
    if (ch) return ch;
    if (!isReconnecting() && Date.now() - start > 1500) return null;
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

export async function openFrame(iframe, appData, url) {
  if (ownChannel(sessionKeyOf(appData))) {
    await Promise.race([checkAppUpdate(null, appData), new Promise((r) => setTimeout(r, 20000))]);
  }
  iframe.src = url;
}

function showBanner(iframe, text) {
  const box = iframe.parentElement;
  if (!box) return;
  box.querySelector(".viewer-boot-banner")?.remove();
  const bar = document.createElement("div");
  bar.className = "viewer-boot-banner";
  bar.setAttribute("role", "alert");
  bar.textContent = text;
  box.prepend(bar);
}

export async function healOnBootError(iframe, appData, detail = "") {
  const appKey = sessionKeyOf(appData);
  if (healed.has(appKey)) return false;
  healed.add(appKey);
  console.warn("[MyLAN] App boot error, refreshing its cached copy:", detail);
  showBanner(iframe, t("viewer.boot_repairing"));
  const channel = await channelFor(appKey);
  if (!channel) { showBanner(iframe, t("viewer.boot_error_offline")); return false; }
  try {
    const keepMeta = (m) => { appData.updateCheck = m.updateCheck; saveApp({ ...appData }); };
    await downloadAppBundle(channel, appKey, () => {}, keepMeta, false);
  } catch (err) {
    console.warn("[MyLAN] Repair failed:", err);
    showBanner(iframe, t("viewer.boot_error_offline"));
    return false;
  }
  iframe.parentElement?.querySelector(".viewer-boot-banner")?.remove();
  iframe.src = sessionBaseUrl(appKey);
  return true;
}
