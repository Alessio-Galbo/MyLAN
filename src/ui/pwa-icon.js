/**
 * Prepara le icone PNG dell'app attiva in CacheStorage prima che il manifest dinamico le annunci.
 */
export const MANIFEST_CACHE = "mylan-manifest-cache-v2";
const SIZES = [192, 512];

export function hashText(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function toImageSrc(raw) {
  if (raw.startsWith("<svg")) return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(raw);
  return raw;
}

export function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(null), 4000);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = src;
  });
}

export function renderPng(img, size) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high"; // riduzione di un'icona grande senza scalettature
  const w = img.naturalWidth || size;
  const h = img.naturalHeight || size;
  const scale = Math.min(size / w, size / h);
  ctx.drawImage(img, (size - w * scale) / 2, (size - h * scale) / 2, w * scale, h * scale);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/**
 * Restituisce le voci "icons" del manifest con l'icona dell'app (PNG 192 e 512 già in cache),
 * l'URL http originale se non rasterizzabile, oppure null se l'app non ha un'icona utilizzabile.
 */
export async function cacheAppIcons(slug, rawIcon, version) {
  if (!rawIcon) return null;
  const isInline = rawIcon.startsWith("data:image/") || rawIcon.startsWith("<svg");
  if (!isInline && !rawIcon.startsWith("http")) return null;
  try {
    const img = isInline ? await loadImage(toImageSrc(rawIcon)) : null;
    if (img) {
      const cache = await caches.open(MANIFEST_CACHE);
      const icons = [];
      for (const size of SIZES) {
        const blob = await renderPng(img, size);
        if (!blob) return null;
        const src = new URL(`./app-icon.png?app=${encodeURIComponent(slug)}&s=${size}&v=${version}`,
          window.location.href).href;
        await cache.put(src, new Response(blob, { headers: { "Content-Type": "image/png" } }));
        icons.push({ src, sizes: `${size}x${size}`, type: "image/png", purpose: "any" });
      }
      return icons;
    }
  } catch {}
  if (rawIcon.startsWith("http")) return [{ src: rawIcon, sizes: "any", purpose: "any" }];
  return null;
}
