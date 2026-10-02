/**
 * Downloader P2P degli asset dell'applicazione e archiviazione in Cache API.
 */
import { t } from "../core/i18n.js";
import { sendChannelRequest } from "./channel-fetch.js";
import { fetchAppMetadata } from "./app-metadata.js";
import { buildPatchedHtmlString, saveShellHtml, getBaseSessionUrl } from "./html-patcher.js";

const CACHE_NAME = "mylan-session-cache-v2";

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

export async function downloadAppBundle(channel, onProgress, onMetadata) {
  onProgress(5, t("sync.discovering"));
  const indexResp = await sendChannelRequest(channel, "/");
  const htmlText = await indexResp.text();

  const metadata = await fetchAppMetadata(channel, htmlText);
  if (onMetadata) onMetadata(metadata);

  const assetPaths = extractAssets(htmlText);
  await caches.delete(CACHE_NAME);
  const cache = await caches.open(CACHE_NAME);

  const baseSessionUrl = getBaseSessionUrl();
  const patchedHtml = buildPatchedHtmlString(htmlText);
  saveShellHtml(patchedHtml);

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
