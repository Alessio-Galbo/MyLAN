/**
 * Service Worker proxy di MyLAN per intercettare e servire l'app da cache o P2P.
 */
importScripts("./src/loader/sw-pipe.js?v=14", "./src/loader/sw-manifest.js?v=2", "./src/loader/sw-relay.js?v=1");

// Una cache per app: "mylan-session-v3:<chiave>" (src/loader/session-key.js). Le vecchie cache uniche vanno via.
const SESSION_CACHE_PREFIX = "mylan-session-v3:";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith("mylan-session-") && !k.startsWith(SESSION_CACHE_PREFIX))
        .map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.endsWith("/manifest.json") && url.searchParams.has("app")) {
    event.respondWith(handleManifestRequest(event.request, url));
    return;
  }
  if (url.pathname.endsWith("/app-icon.png") && url.searchParams.has("app")) {
    event.respondWith(handleAppIconRequest(event.request, url));
    return;
  }
  if (!url.pathname.includes("/session/")) return;
  event.respondWith(handleSessionRequest(event.request, url, event.clientId));
});

async function handleSessionRequest(request, url, frameId) {
  const parsed = parseSessionUrl(url);
  if (!parsed) return new Response("Unknown MyLAN session", { status: 404 });
  const { appKey, path: relativePath } = parsed;
  const cacheName = SESSION_CACHE_PREFIX + appKey;
  const isApi = relativePath.startsWith("/api/");

  const isNoCache = request.headers.get("cache-control") === "no-cache" || request.headers.get("pragma") === "no-cache";
  if (!isApi && !isNoCache && request.method === "GET") {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(url.href);
    if (cached) return cached;
    if (relativePath === "/") {
      const idxCached = await cache.match(url.origin + url.pathname.replace(/\/?$/, "/index.html"));
      if (idxCached) return idxCached;
    }
  }

  // La scheda che ospita questo frame (src/loader/sw-relay.js), non la prima finestra MyLAN trovata.
  const bridgeClient = await pickRelayClient(appKey, frameId);
  if (!bridgeClient) {
    return new Response("No active MyLAN client", { status: 503 });
  }

  // Corpo letto come byte: arriva all'host identico (anche file e Blob), non piu' come testo.
  let body = null;
  if (request.method !== "GET" && request.method !== "HEAD") {
    try { body = await request.arrayBuffer(); } catch {}
  }

  const response = await bridgeStreamRequest(bridgeClient, {
    type: "mylan:sw-fetch",
    appKey,
    path: relativePath,
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    body
  }, request.signal, body ? [body] : []);

  const isFallback = response.headers.get("x-mylan-fallback") === "1";
  if (!isApi && !isFallback && request.method === "GET" && response.ok && response.body) {
    const [stream1, stream2] = response.body.tee();
    const cacheResp = new Response(stream1, { status: response.status, headers: response.headers });
    caches.open(cacheName).then((c) => c.put(new Request(url.href), cacheResp)).catch(() => {});
    return new Response(stream2, { status: response.status, headers: response.headers });
  }

  return response;
}
