/**
 * Icone dichiarate dall'app ("icons" del suo /.well-known/mylan.json o manifest.json) per la PWA installata di quella
 * app: scaricate sul canale e salvate nella cache del manifest, ognuna con misura e scopo ("any", "maskable").
 * Android disegna la schermata di avvio con l'icona piu' grande: per questo servono almeno 512 "any" e 512
 * "maskable" (docs/APP_SPEC.md §2). Il Service Worker le serve da li' (src/loader/sw-manifest.js).
 */
import { sendChannelRequest } from "./channel-fetch.js?v=e19f7df8665d";
import { MANIFEST_CACHE, hashText } from "../ui/pwa-icon.js?v=e19f7df8665d";

const MAX_ICONS = 8;
const MAX_BYTES = 1024 * 1024;
const TYPES = /^image\/(png|webp|jpeg|svg\+xml)$/;

/** Voci "icons" valide (percorso locale dell'app, misure, scopo), al massimo 8. */
export function parseDeclaredIcons(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((i) => typeof i?.src === "string" && i.src && !/^(https?:|data:|\/\/)/.test(i.src))
    .slice(0, MAX_ICONS).map((i) => ({
      src: i.src.startsWith("/") ? i.src : "/" + i.src.replace(/^\.\//, ""),
      sizes: typeof i.sizes === "string" ? i.sizes.trim().slice(0, 40) : "",
      type: typeof i.type === "string" ? i.type : "",
      purpose: /maskable/.test(i.purpose || "") ? (/any/.test(i.purpose) ? "any maskable" : "maskable") : "any"
    }));
}

/** Scarica le icone dichiarate e restituisce le voci del manifest con gli URL in cache ([] se nessuna riesce). */
export async function cacheDeclaredIcons(channel, slug, declared) {
  const out = [];
  let cache;
  try { cache = await caches.open(MANIFEST_CACHE); } catch { return out; }
  for (const icon of declared) {
    try {
      const res = await Promise.race([sendChannelRequest(channel, icon.src),
        new Promise((r) => setTimeout(() => r(null), 6000))]);
      if (!res || res.status !== 200) continue;
      const blob = await res.blob();
      const type = (res.headers?.get?.("content-type") || icon.type || "").split(";")[0].trim();
      if (!blob.size || blob.size > MAX_BYTES || !TYPES.test(type)) continue;
      const v = hashText([icon.src, icon.sizes, icon.purpose, blob.size].join("|"));
      const sizeTag = (icon.sizes.split(/\s+/)[0] || "any").replace(/[^0-9xany]/g, "");
      const url = new URL(`./app-icon.png?app=${encodeURIComponent(slug)}&s=${sizeTag}` +
        `&p=${encodeURIComponent(icon.purpose)}&v=${v}`, window.location.href).href;
      await cache.put(url, new Response(blob, { headers: { "Content-Type": type } }));
      out.push({ src: url, sizes: icon.sizes || "any", type, purpose: icon.purpose });
    } catch {}
  }
  return out;
}

/** Lato piu' lungo dichiarato di un'icona ("192x192 512x512" -> 512; "any" -> Infinity per gli SVG). */
export function iconSide(icon) {
  if (/any/.test(icon.sizes || "") && /svg/.test(icon.type || "")) return Infinity;
  return Math.max(0, ...String(icon.sizes || "").split(/\s+/).map((s) => parseInt(s, 10) || 0));
}
