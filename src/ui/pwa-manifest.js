/**
 * Gestione dinamica del Web App Manifest per l'installazione Multi-PWA borderless di ciascuna applicazione.
 * Ordine garantito: icone in CacheStorage -> manifest in CacheStorage -> unico <link rel="manifest"> aggiornato.
 */
import { getAppSlug } from "./viewer-meta.js";
import { MANIFEST_CACHE, cacheAppIcons, hashText } from "./pwa-icon.js";

let applySeq = 0;

function setManifestLink(href) {
  const links = document.querySelectorAll("link[rel='manifest']");
  if (links.length === 1 && links[0].href === new URL(href, window.location.href).href) return;
  const link = document.createElement("link");
  link.rel = "manifest";
  link.href = href;
  if (links[0]?.parentNode) links[0].parentNode.replaceChild(link, links[0]);
  else document.head.appendChild(link);
  for (let i = 1; i < links.length; i++) links[i].remove();
}

export async function applyAppManifest(appData) {
  if (!appData) return;
  const seq = ++applySeq;
  const slug = getAppSlug(appData);
  const iconRaw = (appData.icon || "").trim();
  const title = appData.title || "Web Application";
  const version = hashText([title, iconRaw, appData.themeColor || "", appData.description || ""].join("|"));
  const appIcons = await cacheAppIcons(slug, iconRaw, version);
  if (seq !== applySeq) return;

  const baseUrl = new URL(window.location.pathname, window.location.origin);
  baseUrl.searchParams.set("app", slug);
  const startUrl = baseUrl.toString();

  const png192 = new URL("./src/icons/icon-192.png", window.location.href).href;
  const png512 = new URL("./src/icons/icon-512.png", window.location.href).href;
  // Le icone MyLAN servono solo se l'app non ne fornisce una: se presenti insieme (soprattutto "maskable")
  // Chrome Android potrebbe preferirle a quelle dell'app.
  const icons = appIcons || [
    { src: png192, sizes: "192x192", type: "image/png", purpose: "any" },
    { src: png512, sizes: "512x512", type: "image/png", purpose: "any" }
  ];

  const manifest = {
    name: title,
    short_name: appData.title || "App",
    id: startUrl,
    start_url: startUrl,
    scope: new URL("./", window.location.href).href,
    display: "fullscreen",
    display_override: ["fullscreen", "standalone"],
    background_color: "#0b0f19",
    theme_color: appData.themeColor || "#0b0f19",
    description: appData.description || "Web Application standalone via MyLAN",
    icons
  };

  // URL versionato: Chrome rilegge il manifest solo se l'href del link cambia davvero.
  const manifestUrl = new URL(`./manifest.json?app=${encodeURIComponent(slug)}&v=${version}`,
    window.location.href).href;
  try {
    const cache = await caches.open(MANIFEST_CACHE);
    await cache.put(manifestUrl, new Response(JSON.stringify(manifest), {
      headers: { "Content-Type": "application/manifest+json; charset=utf-8" }
    }));
  } catch {}
  if (seq !== applySeq) return;
  setManifestLink(manifestUrl);
}

export function restoreDefaultManifest() {
  applySeq++;
  setManifestLink("./manifest.json");
}
