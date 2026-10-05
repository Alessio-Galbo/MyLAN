/**
 * Voci "icons" del manifest della PWA installata di un'app a partire dalle icone che l'app dichiara (gia' in cache,
 * src/loader/app-icons.js): tutte, con misure e scopo. Se nessuna icona "any" arriva a 512 px, ultima risorsa: la piu'
 * grande viene ingrandita a 512 su canvas (sfocata: e' solo un ripiego, l'app dovrebbe dichiarare la sua 512).
 */
import { MANIFEST_CACHE, loadImage, renderPng } from "./pwa-icon.js?v=1669042733e9";
import { iconSide } from "../loader/app-icons.js?v=1669042733e9";

const isAny = (i) => /any/.test(i.purpose || "any");

async function upscaledFallback(slug, from, version) {
  const img = await loadImage(from.src);
  const blob = img ? await renderPng(img, 512) : null;
  if (!blob) return null;
  const src = new URL(`./app-icon.png?app=${encodeURIComponent(slug)}&s=512&p=any&fallback=1&v=${version}`,
    window.location.href).href;
  await (await caches.open(MANIFEST_CACHE)).put(src, new Response(blob, { headers: { "Content-Type": "image/png" } }));
  console.warn("[MyLAN] The app declares no 512 px icon: using an upscaled copy for the installed PWA");
  return { src, sizes: "512x512", type: "image/png", purpose: "any" };
}

/** null se l'app non dichiara icone utilizzabili. */
export async function declaredManifestIcons(slug, declared, version) {
  const icons = declared.filter((i) => typeof i?.src === "string" && i.src)
    .map((i) => ({ src: i.src, sizes: i.sizes || "any", type: i.type || "image/png", purpose: i.purpose || "any" }));
  if (!icons.length) return null;
  const anyIcons = icons.filter(isAny).sort((a, b) => iconSide(b) - iconSide(a));
  if (!anyIcons.length || iconSide(anyIcons[0]) < 512) {
    const from = anyIcons[0] || [...icons].sort((a, b) => iconSide(b) - iconSide(a))[0];
    try { const big = await upscaledFallback(slug, from, version); if (big) icons.push(big); } catch {}
  }
  return icons;
}
