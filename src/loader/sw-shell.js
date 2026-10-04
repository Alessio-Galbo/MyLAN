/**
 * File di MyLAN stesso nel Service Worker (non quelli delle app): l'avvio non aspetta mai la rete.
 * - Pagina (index.html, anche con ?app= / ?i=): copia salvata subito, nuova copia letta in background. Se la nuova
 *   pagina e' di un'altra pubblicazione, TUTTI i suoi file (elenco in version.json) vengono scaricati prima di
 *   sostituire la pagina salvata: tutto o niente, quindi al lancio dopo parte la nuova versione completa.
 * - File timbrati "?v=<versione>" (Tools/stamp.mjs): non cambiano mai, quindi cache-first. Se mancano si scaricano, ma
 *   solo se version.json dice ancora quella versione (altrimenti il server darebbe file di un'altra: 503, e
 *   src/boot.js riparte dalla versione pubblicata). Si tengono le ultime due versioni.
 */
const SHELL_CACHE = "mylan-shell-v1";
const STAMP_RE = /^[0-9a-f]{12}$/;
const SHELL_SCOPE = () => new URL(self.registration.scope);
let deployedMemo = { at: 0, value: null };

function shellPageKey() { return new URL("index.html", SHELL_SCOPE()).href; }

function isShellPage(request, url) {
  const scope = SHELL_SCOPE();
  return request.mode === "navigate" && url.origin === scope.origin &&
    (url.pathname === scope.pathname || url.pathname === scope.pathname + "index.html");
}

function stampOf(url) {
  const scope = SHELL_SCOPE();
  const v = url.searchParams.get("v");
  return url.origin === scope.origin && url.pathname.startsWith(scope.pathname + "src/") && STAMP_RE.test(v || "") ? v : "";
}

async function deployedVersion(maxAgeMs = 30000) {
  if (deployedMemo.value && Date.now() - deployedMemo.at < maxAgeMs) return deployedMemo.value;
  try {
    const res = await fetch(new URL("version.json", SHELL_SCOPE()).href, { cache: "no-store" });
    const json = res.ok ? await res.json() : null;
    if (json && STAMP_RE.test(json.version || "")) deployedMemo = { at: Date.now(), value: json };
  } catch {}
  return deployedMemo.value;
}

const pageVersion = (html) => (html.match(/boot\.js\?v=([0-9a-f]{12})/) || [])[1] || "";

async function handleShellFile(event, url, v) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(url.href);
  if (hit) return hit;
  const [res, deployed] = await Promise.all([fetch(event.request), deployedVersion()]);
  if (deployed && deployed.version !== v) return new Response("MyLAN version changed", { status: 503 });
  if (res.ok) event.waitUntil(cache.put(url.href, res.clone()).catch(() => {}));
  return res;
}

async function handleShellPage(event) {
  const cache = await caches.open(SHELL_CACHE);
  const saved = await cache.match(shellPageKey());
  if (saved) { event.waitUntil(refreshSavedShell()); return saved; }
  const res = await fetch(shellPageKey(), { cache: "no-cache" }).catch(() => null);
  if (!res) return fetch(event.request);
  event.waitUntil(storeShell(cache, res.clone(), null).catch(() => {}));
  return res;
}

// Una verifica alla volta; anche quando si attiva un Service Worker nuovo (quello di prima puo' essere fermato a meta').
let refreshing = null;
function refreshSavedShell() {
  if (!refreshing) {
    refreshing = (async () => {
      const cache = await caches.open(SHELL_CACHE);
      const saved = await cache.match(shellPageKey());
      if (saved) await storeShell(cache, await fetch(shellPageKey(), { cache: "no-cache" }), saved);
    })().catch(() => {}).finally(() => { refreshing = null; });
  }
  return refreshing;
}
self.addEventListener("activate", () => { refreshSavedShell(); });

// Pagina nuova salvata solo con tutti i file della sua versione gia' in cache (tutto o niente).
async function storeShell(cache, res, saved) {
  if (!res.ok) return;
  const html = await res.clone().text();
  const v = pageVersion(html), old = saved ? pageVersion(await saved.clone().text()) : "";
  if (!v || v === old) return cache.put(shellPageKey(), res);
  const deployed = await deployedVersion(0);
  if (!deployed || deployed.version !== v) return; // pubblicazione in corso: si riprova al prossimo avvio
  const files = (deployed.files || []).filter((f) => typeof f === "string" && /^src\//.test(f));
  const got = await Promise.all(files.map(async (f) => {
    const href = new URL(`${f}?v=${v}`, SHELL_SCOPE()).href;
    if (await cache.match(href)) return [href, null];
    const r = await fetch(href, { cache: "no-cache" });
    return r.ok ? [href, r] : null;
  })).catch(() => null);
  if (!got || got.includes(null) || (await deployedVersion(0))?.version !== v) return;
  for (const [href, r] of got) if (r) await cache.put(href, r);
  await cache.put(shellPageKey(), res);
  for (const req of await cache.keys()) {
    const sv = new URL(req.url).searchParams.get("v");
    if (sv && sv !== v && sv !== old) await cache.delete(req);
  }
}

/** true se la richiesta e' un file di MyLAN gestito qui (risposta gia' data a event). */
function handleShellRequest(event, url) {
  if (event.request.method !== "GET") return false;
  if (isShellPage(event.request, url)) { event.respondWith(handleShellPage(event)); return true; }
  const v = stampOf(url);
  if (!v) return false;
  event.respondWith(handleShellFile(event, url, v));
  return true;
}
