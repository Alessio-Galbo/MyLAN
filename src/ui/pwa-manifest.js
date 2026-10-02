/**
 * Gestione dinamica del Web App Manifest per l'installazione Multi-PWA borderless di ciascuna applicazione.
 */
import { getAppSlug } from "./viewer-meta.js";

async function cacheAppIcon(slug, rawIcon) {
  try {
    const cache = await caches.open("mylan-manifest-cache-v2");
    const iconUrl = new URL("./app-icon.png?app=" + encodeURIComponent(slug), window.location.href).href;
    if (rawIcon.startsWith("data:image/")) {
      const parts = rawIcon.split(",");
      const mime = parts[0].match(/:(.*?);/)?.[1] || "image/png";
      const bstr = atob(parts[1]);
      const u8arr = new Uint8Array(bstr.length);
      for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
      await cache.put(iconUrl, new Response(u8arr, { headers: { "Content-Type": mime } }));
      return iconUrl;
    }
  } catch {}
  return null;
}

export async function applyAppManifest(appData) {
  if (!appData) return;
  const slug = getAppSlug(appData);
  const iconRaw = (appData.icon || "").trim();
  const cachedUrl = await cacheAppIcon(slug, iconRaw);

  const baseUrl = new URL(window.location.pathname, window.location.origin);
  baseUrl.searchParams.set("app", slug);
  const startUrl = baseUrl.toString();

  const png192 = new URL("./src/icons/icon-192.png", window.location.href).href;
  const png512 = new URL("./src/icons/icon-512.png", window.location.href).href;
  const targetIcon = cachedUrl || (iconRaw.startsWith("http") ? iconRaw : png192);

  const iconsList = [
    { src: targetIcon, sizes: "192x192", type: "image/png", purpose: "any" },
    { src: targetIcon, sizes: "512x512", type: "image/png", purpose: "maskable" },
    { src: png192, sizes: "192x192", type: "image/png", purpose: "any" },
    { src: png512, sizes: "512x512", type: "image/png", purpose: "maskable" }
  ];

  const manifest = {
    name: appData.title || "Web Application",
    short_name: appData.title || "App",
    id: startUrl,
    start_url: startUrl,
    scope: new URL("./", window.location.href).href,
    display: "fullscreen",
    display_override: ["fullscreen", "standalone"],
    background_color: "#0b0f19",
    theme_color: appData.themeColor || "#0b0f19",
    description: appData.description || "Web Application standalone via MyLAN",
    icons: iconsList
  };

  const manifestUrl = new URL("./manifest.json?app=" + encodeURIComponent(slug), window.location.href).href;
  try {
    const cache = await caches.open("mylan-manifest-cache-v2");
    await cache.put(manifestUrl, new Response(JSON.stringify(manifest), {
      headers: { "Content-Type": "application/manifest+json; charset=utf-8" }
    }));
  } catch {}

  const current = document.querySelector("link[rel='manifest']");
  const link = document.createElement("link");
  link.rel = "manifest";
  link.href = manifestUrl;
  if (current?.parentNode) current.parentNode.replaceChild(link, current);
  else document.head.appendChild(link);
}

export function restoreDefaultManifest() {
  const current = document.querySelector("link[rel='manifest']");
  const link = document.createElement("link");
  link.rel = "manifest";
  link.href = "./manifest.json";
  if (current?.parentNode) current.parentNode.replaceChild(link, current);
}
