/**
 * Downloader P2P degli asset dell'applicazione e archiviazione in Cache API.
 */
import { t } from "../core/i18n.js?v=47145387c383";
import { sendChannelRequest } from "./channel-fetch.js?v=47145387c383";
import { fetchAppMetadata } from "./app-metadata.js?v=47145387c383";
import { setMediaPaths } from "./sw-channel-selector.js?v=47145387c383";
import { setChunkedUploads } from "./channel-body.js?v=47145387c383";
import { buildPatchedHtmlString, saveShellHtml } from "./html-patcher.js?v=47145387c383";
import { sessionBaseUrl, sessionCacheName } from "./session-key.js?v=47145387c383";
import { refreshCachedFiles, hostVersion, storeVersion } from "./app-updater.js?v=47145387c383";
import { saveRuntimeRules } from "./runtime-rules.js?v=47145387c383";
import { cacheDeclaredIcons } from "./app-icons.js?v=47145387c383";
import { getAppSlug } from "../ui/viewer-meta.js?v=47145387c383";

function extractAssets(html) {
  const assets = new Set();
  const linkRegex = /<link[^>]+href=["']([^"']+)["']/gi;
  const scriptRegex = /<script[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = linkRegex.exec(html)) !== null) {
    if (!m[1].startsWith("data:") && !m[1].startsWith("http")) assets.add(m[1]);
  }
  while ((m = scriptRegex.exec(html)) !== null) {
    if (!m[1].startsWith("data:") && !m[1].startsWith("http")) assets.add(m[1]);
  }
  return Array.from(assets);
}

// Un'app salvata (e i suoi dati offline) non deve sparire quando il dispositivo e' a corto di spazio: si chiede al browser
// di rendere persistente lo spazio dell'origine (navigator.storage.persist), se non lo e' gia'. Senza risposta: niente.
function askPersistentStorage() {
  const sm = navigator.storage;
  if (sm?.persist) sm.persisted().then((p) => p || sm.persist()).catch(() => {});
}

/**
 * Scarica il pacchetto dell'app "appKey" nella sua cache (le altre app non vengono toccate): pagina iniziale, metadati,
 * poi i file citati dalla pagina IN PARALLELO (prima uno alla volta: ~70 file x un RTT del canale). fresh: prima
 * installazione (cache svuotata); altrimenti aggiornamento, e la cache si sostituisce solo a scaricamento riuscito.
 */
export async function downloadAppBundle(channel, appKey, onProgress, onMetadata, fresh = true) {
  onProgress(5, t("sync.discovering"));
  const indexResp = await sendChannelRequest(channel, "/");
  if (!indexResp.ok) throw new Error("HTTP " + indexResp.status);
  const htmlText = await indexResp.text();

  const metadata = await fetchAppMetadata(channel, htmlText);
  setMediaPaths(metadata.mediaPaths);
  setChunkedUploads(metadata.chunkedUploads);
  await saveRuntimeRules(appKey, metadata.runtimeCache);
  metadata.icons = await cacheDeclaredIcons(channel, getAppSlug({ title: metadata.name }), metadata.declaredIcons);
  if (onMetadata) onMetadata(metadata);

  const assetPaths = extractAssets(htmlText).map((p) => (p.startsWith("/") ? p : "/" + p));
  if (fresh) await caches.delete(sessionCacheName(appKey));
  await refreshCachedFiles(channel, appKey, assetPaths,
    (i, n) => onProgress(Math.round(15 + (i / n) * 80), i + " / " + n), !fresh);

  const baseSessionUrl = sessionBaseUrl(appKey);
  const patchedHtml = buildPatchedHtmlString(htmlText, appKey);
  saveShellHtml(patchedHtml, appKey);
  const cache = await caches.open(sessionCacheName(appKey));
  const htmlHeaders = { "Content-Type": "text/html; charset=utf-8" };
  await cache.put(new Request(baseSessionUrl), new Response(patchedHtml, { headers: htmlHeaders }));
  await cache.put(new Request(baseSessionUrl + "index.html"), new Response(patchedHtml, { headers: htmlHeaders }));
  storeVersion(appKey, await hostVersion(channel, metadata.updateCheck, htmlText));

  askPersistentStorage();
  onProgress(100, t("sync.ready"));
  return { ready: true, metadata };
}
