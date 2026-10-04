/**
 * Gestione delle risposte Web App Manifest dinamiche per PWA standalone nel Service Worker.
 */
async function handleManifestRequest(request, url) {
  try {
    const cache = await caches.open("mylan-manifest-cache-v2");
    const cached = await cache.match(request.url);
    if (cached) return cached;
  } catch {}
  const appSlug = url.searchParams.get("app") || "";
  const startUrl = new URL("./?app=" + encodeURIComponent(appSlug), url.origin + url.pathname).href;
  return new Response(JSON.stringify({
    name: "Web Application",
    short_name: "App",
    start_url: startUrl,
    display: "standalone",
    background_color: "#0b0f19",
    theme_color: "#0b0f19",
    icons: [
      { src: "./src/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "./src/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "./src/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  }), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8" }
  });
}

async function handleAppIconRequest(request, url) {
  try {
    const cache = await caches.open("mylan-manifest-cache-v2");
    const cached = await cache.match(request.url);
    if (cached) return cached;
  } catch {}
  return fetch(new URL("./src/icons/icon-192.png", url.origin + url.pathname).href);
}
