/**
 * Service Worker proxy di MyLAN per intercettare e servire l'app da cache o P2P.
 */
importScripts("./src/loader/sw-pipe.js?v=13", "./src/loader/sw-manifest.js?v=2");

const CACHE_NAME = "mylan-session-cache-v2";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith("mylan-session-") && k !== CACHE_NAME).map((k) => caches.delete(k)))
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
  event.respondWith(handleSessionRequest(event.request, url));
});

async function handleSessionRequest(request, url) {
  const sessionPrefixIndex = url.pathname.indexOf("/session/");
  const relativePath = url.pathname.slice(sessionPrefixIndex + "/session/".length - 1) + url.search;
  const isApi = relativePath.startsWith("/api/");

  const isNoCache = request.headers.get("cache-control") === "no-cache" || request.headers.get("pragma") === "no-cache";
  if (!isApi && !isNoCache) {
    const cached = (await caches.match(url.href)) || (await caches.match(request));
    if (cached) return cached;
    if (relativePath === "/" || relativePath === "") {
      const idxCached = await caches.match(url.origin + url.pathname.replace(/\/?$/, "/index.html"));
      if (idxCached) return idxCached;
    }
  }

  const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const bridgeClient = clientList.find((c) => !c.url.includes("/session/")) || clientList[0];
  if (!bridgeClient) {
    return new Response("No active MyLAN client", { status: 503 });
  }

  let bodyText = "";
  if (request.method !== "GET" && request.method !== "HEAD") {
    try { bodyText = await request.text(); } catch {}
  }

  const response = await bridgeStreamRequest(bridgeClient, {
    type: "mylan:sw-fetch",
    path: relativePath || "/",
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    body: bodyText
  }, request.signal);

  const isFallback = response.headers.get("x-mylan-fallback") === "1";
  if (!isApi && !isFallback && response.ok && response.body) {
    const [stream1, stream2] = response.body.tee();
    const cacheResp = new Response(stream1, { status: response.status, headers: response.headers });
    caches.open(CACHE_NAME).then((c) => c.put(new Request(url.href), cacheResp)).catch(() => {});
    return new Response(stream2, { status: response.status, headers: response.headers });
  }

  return response;
}
