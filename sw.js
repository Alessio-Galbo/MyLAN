/**
 * Service Worker proxy di MyLAN per intercettare e servire l'app da cache o P2P.
 */
// Timbri ?v= scritti da Tools/stamp.mjs (versione del Service Worker): mai a mano.
importScripts(
  "./src/loader/sw-pipe.js?v=eab1a0c0f84c",
  "./src/loader/sw-manifest.js?v=eab1a0c0f84c",
  "./src/loader/sw-relay.js?v=eab1a0c0f84c",
  "./src/loader/sw-runtime-cache.js?v=eab1a0c0f84c",
  "./src/loader/sw-runtime-store.js?v=eab1a0c0f84c",
  "./src/loader/sw-runtime-quota.js?v=eab1a0c0f84c");

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
  event.respondWith(handleSessionRequest(event, url));
});

async function handleSessionRequest(event, url) {
  const request = event.request;
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

  // Corpo letto come byte: arriva all'host identico (anche file e Blob), non piu' come testo.
  let body = null;
  if (request.method !== "GET" && request.method !== "HEAD") {
    try { body = await request.arrayBuffer(); } catch {}
  }
  const forward = (extra) => forwardToHost(request, appKey, relativePath, event.clientId, body, extra);

  // GET dichiarate dall'app in "runtime_cache" (anche sotto /api/): cache di runtime per app (sw-runtime-cache.js).
  const rule = await runtimeRuleFor(appKey, relativePath, request);
  if (rule) return runtimeFetch(event, rule, url, appKey, forward);

  const response = await forward();
  const isFallback = response.headers.get("x-mylan-fallback") === "1";
  if (!isApi && !isFallback && request.method === "GET" && response.ok && response.body) {
    const [stream1, stream2] = response.body.tee();
    const cacheResp = new Response(stream1, { status: response.status, headers: response.headers });
    caches.open(cacheName).then((c) => c.put(new Request(url.href), cacheResp)).catch(() => {});
    return new Response(stream2, { status: response.status, headers: response.headers });
  }
  return response;
}

// La scheda che ospita questo frame (src/loader/sw-relay.js), non la prima finestra MyLAN trovata.
async function forwardToHost(request, appKey, relativePath, frameId, body, extraHeaders) {
  const bridgeClient = await pickRelayClient(appKey, frameId);
  if (!bridgeClient) return new Response("No active MyLAN client", { status: 503 });
  const headers = { ...Object.fromEntries(request.headers.entries()), ...(extraHeaders || {}) };
  return bridgeStreamRequest(bridgeClient, {
    type: "mylan:sw-fetch", appKey, path: relativePath, method: request.method, headers, body
  }, extraHeaders ? null : request.signal, body ? [body] : []);
}
