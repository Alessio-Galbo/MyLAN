/**
 * Downloader P2P degli asset dell'applicazione e archiviazione in Cache API.
 */
import { t } from "../core/i18n.js";
import { sendChannelRequest } from "./channel-fetch.js";
import { fetchAppMetadata } from "./app-metadata.js";
import { setMediaPaths } from "./sw-channel-selector.js";
import { setChunkedUploads } from "./channel-body.js";
import { buildPatchedHtmlString, saveShellHtml } from "./html-patcher.js";
import { sessionBaseUrl, sessionCacheName } from "./session-key.js";

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

/** Scarica il pacchetto dell'app "appKey" nella sua cache: le altre app salvate non vengono toccate. */
export async function downloadAppBundle(channel, appKey, onProgress, onMetadata) {
  onProgress(5, t("sync.discovering"));
  const indexResp = await sendChannelRequest(channel, "/");
  const htmlText = await indexResp.text();

  const metadata = await fetchAppMetadata(channel, htmlText);
  setMediaPaths(metadata.mediaPaths);
  setChunkedUploads(metadata.chunkedUploads);
  if (onMetadata) onMetadata(metadata);

  const assetPaths = extractAssets(htmlText);
  await caches.delete(sessionCacheName(appKey));
  const cache = await caches.open(sessionCacheName(appKey));

  const baseSessionUrl = sessionBaseUrl(appKey);
  const patchedHtml = buildPatchedHtmlString(htmlText, appKey);
  saveShellHtml(patchedHtml, appKey);

  const htmlHeaders = { "Content-Type": "text/html; charset=utf-8" };
  await cache.put(new Request(baseSessionUrl), new Response(patchedHtml, { headers: htmlHeaders }));
  await cache.put(new Request(baseSessionUrl + "index.html"), new Response(patchedHtml, { headers: htmlHeaders }));

  const total = assetPaths.length;
  for (let i = 0; i < total; i++) {
    const rawPath = assetPaths[i];
    const cleanPath = rawPath.startsWith("/") ? rawPath : "/" + rawPath;
    onProgress(Math.round(15 + (i / (total || 1)) * 80), (i + 1) + " / " + total);

    try {
      const resp = await sendChannelRequest(channel, cleanPath);
      const targetUrl = new URL(cleanPath.replace(/^\//, ""), baseSessionUrl).href;
      await cache.put(new Request(targetUrl), resp.clone());
    } catch {
      // Ignora asset secondari non bloccanti
    }
  }

  onProgress(100, t("sync.ready"));
  return { ready: true, metadata };
}
