/**
 * Regole "runtime_cache" del /.well-known/mylan.json di un'app (lato pagina): lettura con limiti e salvataggio nella
 * cache "mylan-runtime:<chiave>", dove il Service Worker le legge (src/loader/sw-runtime-cache.js). Le voci di percorsi
 * non piu' dichiarati vengono tolte; la cache sparisce con l'app (src/storage/app-cleanup.js).
 */
import { sendChannelRequest } from "./channel-fetch.js?v=e19f7df8665d";
import { sessionBaseUrl } from "./session-key.js?v=e19f7df8665d";

export const RUNTIME_PREFIX = "mylan-runtime:";
const STRATEGIES = ["cache-first", "stale-while-revalidate", "network-first"];
const strings = (a) => (Array.isArray(a) ? a.filter((s) => typeof s === "string" && s).slice(0, 10) : undefined);
const clamp = (v, min, max, def) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Math.round(Number(v)))) : def);

/**
 * Regole valide (al massimo 10): prefix che inizia con "/", strategia nota. max_entries e' un tetto facoltativo (assente =
 * nessun numero fisso: decide solo la guardia sulla quota, src/loader/sw-runtime-quota.js).
 */
export function parseRuntimeCache(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((r) => typeof r?.prefix === "string" && r.prefix.startsWith("/") && r.prefix.length > 1)
    .slice(0, 10).map((r) => ({
      prefix: r.prefix,
      strategy: STRATEGIES.includes(r.strategy) ? r.strategy : "cache-first",
      max_entries: r.max_entries == null ? undefined : clamp(r.max_entries, 1, 1000000, undefined),
      max_entry_kb: clamp(r.max_entry_kb, 1, 4096, 1024),
      timeout_ms: clamp(r.timeout_ms, 500, 15000, 4000),
      keep_params: strings(r.keep_params),
      version_param: typeof r.version_param === "string" && r.version_param ? r.version_param : undefined
    }));
}

const rulesUrl = (appKey) => sessionBaseUrl(appKey).replace(/session\/[^/]+\/$/, "") + "mylan-runtime-rules/" + appKey;

/** Salva le regole (anche vuote: segna che l'app e' stata letta) e toglie le voci che nessuna regola copre piu'. */
export async function saveRuntimeRules(appKey, rules) {
  try {
    const cache = await caches.open(RUNTIME_PREFIX + appKey);
    await cache.put(rulesUrl(appKey), new Response(JSON.stringify({ rules: rules || [] }),
      { headers: { "Content-Type": "application/json" } }));
    const base = sessionBaseUrl(appKey);
    for (const req of await cache.keys()) {
      if (!req.url.startsWith(base)) continue;
      const path = "/" + req.url.slice(base.length).split("?")[0];
      if (!(rules || []).some((r) => path.startsWith(r.prefix))) await cache.delete(req);
    }
    navigator.serviceWorker?.controller?.postMessage({ type: "mylan:runtime-rules", appKey });
  } catch {}
}

/** App salvate prima delle regole: le legge una volta dall'host, alla prima connessione. */
export async function ensureRuntimeRules(channel, appKey) {
  try {
    if (await (await caches.open(RUNTIME_PREFIX + appKey)).match(rulesUrl(appKey))) return;
    const res = await sendChannelRequest(channel, "/.well-known/mylan.json");
    const manifest = res.status === 200 ? await res.json() : null;
    if (manifest) await saveRuntimeRules(appKey, parseRuntimeCache(manifest?.runtime_cache));
  } catch {}
}

/**
 * "mylan:runtime-cache-drop" dall'app (src/ui/app-viewer.js): risorse tolte dall'host (es. copertine di brani
 * eliminati). Cancella SOLO dalla cache di runtime di quell'app le voci con quei percorsi (parametri ignorati) che una
 * sua regola copre; tutto il resto (pagina, file dell'app, altre app) non si tocca. Al massimo 10000 percorsi.
 */
export async function dropRuntimeEntries(appKey, paths) {
  if (!Array.isArray(paths) || !paths.length) return 0;
  const gone = new Set(paths.filter((p) => typeof p === "string" && p.startsWith("/")).slice(0, 10000));
  let removed = 0;
  try {
    const cache = await caches.open(RUNTIME_PREFIX + appKey);
    const hit = await cache.match(rulesUrl(appKey));
    const rules = hit ? (await hit.json()).rules || [] : [];
    const base = sessionBaseUrl(appKey);
    for (const req of await cache.keys()) {
      if (!req.url.startsWith(base)) continue;
      const path = "/" + req.url.slice(base.length).split("?")[0];
      if (gone.has(path) && rules.some((r) => path.startsWith(r.prefix)) && (await cache.delete(req))) removed++;
    }
  } catch {}
  return removed;
}
