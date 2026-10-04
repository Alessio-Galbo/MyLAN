/**
 * Modulo di scoperta ed estrazione dei metadati dell'applicazione remota (Manifest/HTML).
 */
import { t } from "../core/i18n.js?v=e19f7df8665d";
import { sendChannelRequest } from "./channel-fetch.js?v=e19f7df8665d";
import { parseRuntimeCache } from "./runtime-rules.js?v=e19f7df8665d";
import { parseDeclaredIcons } from "./app-icons.js?v=e19f7df8665d";

async function fetchJsonSafely(channel, path) {
  try {
    const res = await sendChannelRequest(channel, path);
    if (res.status === 200) return await res.json();
  } catch {}
  return null;
}

function extractFromHtml(html) {
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const desc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
               html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  const icon = html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i) ||
               html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i) ||
               html.match(/<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i);
  return {
    name: title ? title[1].trim() : "",
    description: desc ? desc[1].trim() : "",
    iconPath: icon ? icon[1].trim() : ""
  };
}

async function resolveIconDataUrl(channel, iconPath) {
  if (!iconPath || iconPath.startsWith("data:") || iconPath.trim().startsWith("<svg")) return iconPath;
  try {
    const clean = iconPath.startsWith("/") ? iconPath : "/" + iconPath;
    const fetchWork = async () => {
      const res = await sendChannelRequest(channel, clean);
      if (res.status !== 200) return "";
      const blob = await res.blob();
      if (!blob || blob.size === 0) return "";
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => resolve("");
        reader.readAsDataURL(blob);
      });
    };
    const timer = new Promise((resolve) => setTimeout(() => resolve(""), 4000));
    return await Promise.race([fetchWork(), timer]);
  } catch {
    return "";
  }
}

export async function fetchAppMetadata(channel, htmlText = "") {
  let manifest = await fetchJsonSafely(channel, "/.well-known/mylan.json");
  if (!manifest) manifest = await fetchJsonSafely(channel, "/manifest.json");

  const htmlMeta = extractFromHtml(htmlText);
  const name = manifest?.name || manifest?.short_name || htmlMeta.name || t("sync.default_app_name");
  const description = manifest?.description || htmlMeta.description || t("sync.default_app_desc");
  const themeColor = typeof manifest?.theme_color === "string" ? manifest.theme_color.slice(0, 32) : "";

  let iconCandidate = manifest?.icon || "";
  if (!iconCandidate && Array.isArray(manifest?.icons) && manifest.icons.length > 0) {
    const preferred = manifest.icons.find((i) => i.src?.endsWith(".svg")) ||
                      manifest.icons.find((i) => i.sizes?.includes("192")) ||
                      manifest.icons[0];
    iconCandidate = preferred?.src || "";
  }
  if (!iconCandidate) iconCandidate = htmlMeta.iconPath;

  const icon = await resolveIconDataUrl(channel, iconCandidate);
  const mediaPaths = Array.isArray(manifest?.media_paths)
    ? manifest.media_paths.filter((p) => typeof p === "string" && p.startsWith("/")).slice(0, 20)
    : [];
  const chunkedUploads = manifest?.chunked_uploads === true;
  const uc = manifest?.update_check;  // {url, field}: dove l'host dice la versione dell'app (app-updater.js)
  const updateCheck = typeof uc?.url === "string" && uc.url.startsWith("/")
    ? { url: uc.url, field: typeof uc.field === "string" ? uc.field : "version" } : null;
  const runtimeCache = parseRuntimeCache(manifest?.runtime_cache); // GET da tenere offline (src/loader/runtime-rules.js)
  const backgroundColor = typeof manifest?.background_color === "string" ? manifest.background_color.slice(0, 32) : "";
  const declaredIcons = parseDeclaredIcons(manifest?.icons); // PWA installata dell'app (src/loader/app-icons.js)
  return { name, description, themeColor, backgroundColor, icon, declaredIcons, mediaPaths, chunkedUploads, updateCheck,
    runtimeCache };
}
