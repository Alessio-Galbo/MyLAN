/**
 * Cache di runtime per app (lato Service Worker): solo le GET che l'app dichiara in "runtime_cache" del suo
 * /.well-known/mylan.json (es. copertine sotto /api/...). Le regole stanno nella cache "mylan-runtime:<chiave>"
 * (scritte dalla pagina, src/loader/runtime-rules.js); le altre risposte /api/ non vengono mai salvate.
 * Con il canale giu' una voce gia' vista esce subito dalla cache, senza aspettare la riconnessione.
 */
const RUNTIME_PREFIX = "mylan-runtime:";
const RUNTIME_RULES_URL = (appKey) => new URL("./mylan-runtime-rules/" + appKey, self.registration.scope).href;
const RULES_TTL_MS = 30000;
const rulesMemo = new Map();

async function runtimeRules(appKey) {
  const memo = rulesMemo.get(appKey);
  if (memo && memo.until > Date.now()) return memo.rules;
  let rules = [];
  try {
    const hit = await (await caches.open(RUNTIME_PREFIX + appKey)).match(RUNTIME_RULES_URL(appKey));
    if (hit) rules = (await hit.json()).rules || [];
  } catch {}
  rulesMemo.set(appKey, { rules, until: Date.now() + RULES_TTL_MS });
  return rules;
}

// La pagina ha riscritto le regole: niente memoria vecchia.
self.addEventListener("message", (e) => { if (e.data?.type === "mylan:runtime-rules") rulesMemo.delete(e.data.appKey); });

async function runtimeRuleFor(appKey, path, request) {
  if (request.method !== "GET" || request.headers.has("range")) return null;
  const pathname = path.split("?")[0];
  return (await runtimeRules(appKey)).find((r) => pathname.startsWith(r.prefix)) || null;
}

// Chiave della voce: con keep_params solo quei parametri (es. versione e misura), altrimenti l'URL intero.
function runtimeKey(url, rule) {
  if (!Array.isArray(rule.keep_params)) return url.href;
  const keep = new URLSearchParams();
  for (const name of rule.keep_params) if (url.searchParams.has(name)) keep.set(name, url.searchParams.get(name));
  const q = keep.toString();
  return url.origin + url.pathname + (q ? "?" + q : "");
}

async function runtimeLookup(appKey, key) {
  try { return (await (await caches.open(RUNTIME_PREFIX + appKey)).match(key)) || null; } catch { return null; }
}

/**
 * forward(headers?) porta la richiesta all'host sul canale (503 subito se il canale manca e non si sta riconnettendo).
 * cache-first (e ogni URL con version_param): una voce salvata vale finche' c'e'. stale-while-revalidate: subito la
 * copia salvata, poi verifica in background (If-None-Match). network-first: rete, la copia salvata se fallisce o tarda
 * (l'unica strategia che aspetta, al massimo timeout_ms).
 */
async function runtimeFetch(event, rule, url, appKey, forward) {
  const key = runtimeKey(url, rule);
  const noCache = /no-cache/.test(event.request.headers.get("cache-control") || "");
  const cached = await runtimeLookup(appKey, key);
  const versioned = rule.version_param && url.searchParams.has(rule.version_param); // URL con versione: non cambia
  const strategy = noCache ? "network-first" : versioned ? "cache-first" : rule.strategy;
  if (cached && strategy !== "network-first") {
    if (strategy === "stale-while-revalidate") event.waitUntil(revalidate(rule, appKey, key, cached, forward));
    return cached;
  }
  // Canale non ancora aperto (avvio, riconnessione, host spento): la stessa risorsa con un'altra versione o misura
  // esce subito; quella esatta si scarica e si salva in background appena il canale c'e'.
  if (strategy !== "network-first") {
    const other = await runtimeAnyVersion(appKey, key);
    if (other && !(await relayChannelOpen(appKey, event.clientId))) {
      event.waitUntil(revalidate(rule, appKey, key, null, forward));
      return other;
    }
  }
  let res = null;
  const wait = cached ? Math.min(Number(rule.timeout_ms) || 4000, 15000) : 0; // con una copia: niente attese lunghe
  try { res = await (wait ? Promise.race([forward(), new Promise((r) => setTimeout(() => r(null), wait))]) : forward()); } catch {}
  if (res && res.status === 200 && res.body && res.headers.get("x-mylan-fallback") !== "1") {
    const [a, b] = res.body.tee();
    const toStore = new Response(a, { status: 200, headers: res.headers });
    event.waitUntil(runtimeStore(rule, appKey, key, toStore).catch(() => {}));
    return new Response(b, { status: 200, headers: res.headers });
  }
  const other = cached || (rule.version_param && (await runtimeAnyVersion(appKey, key))); // come prima: altra versione
  return other || res || new Response("Host not reachable", { status: 503 });
}

// Host irraggiungibile e nessuna copia di questo URL: va bene la stessa risorsa con un'altra versione o misura.
async function runtimeAnyVersion(appKey, key) {
  try { return (await (await caches.open(RUNTIME_PREFIX + appKey)).match(key, { ignoreSearch: true })) || null; } catch { return null; }
}

async function revalidate(rule, appKey, key, cached, forward) {
  try {
    const etag = cached?.headers.get("etag");
    const res = await forward(etag ? { "if-none-match": etag } : {});
    if (res.status === 200 && res.headers.get("x-mylan-fallback") !== "1") await runtimeStore(rule, appKey, key, res);
  } catch {}
}
