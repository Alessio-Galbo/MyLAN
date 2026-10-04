/**
 * Scrittura nella cache di runtime di un'app (src/loader/sw-runtime-cache.js) con limiti: nessuna voce oltre
 * max_entry_kb, con version_param una sola versione per risorsa (la nuova sostituisce le altre con lo stesso percorso e
 * gli stessi altri parametri) e, solo se la regola lo chiede, al massimo max_entries voci (le piu' vecchie escono per
 * prime). Senza max_entries nessun numero fisso: decide la guardia sulla quota (src/loader/sw-runtime-quota.js).
 */
const RUNTIME_MAX_ENTRY_KB = 4096;

function sessionPathOf(href) {
  const u = new URL(href);
  const rest = u.pathname.slice(u.pathname.indexOf("/session/") + "/session/".length);
  return rest.slice(rest.indexOf("/"));
}

function sameResourceOtherVersion(a, b, param) {
  const ua = new URL(a), ub = new URL(b);
  if (ua.pathname !== ub.pathname || ua.searchParams.get(param) === ub.searchParams.get(param)) return false;
  ua.searchParams.delete(param); ub.searchParams.delete(param);
  ua.searchParams.sort(); ub.searchParams.sort();
  return ua.search === ub.search;
}

async function runtimeStore(rule, appKey, key, res) {
  const blob = await res.blob();
  const maxKb = Math.min(Number(rule.max_entry_kb) || 1024, RUNTIME_MAX_ENTRY_KB);
  if (blob.size === 0 || blob.size > maxKb * 1024) return;
  const cache = await caches.open(RUNTIME_PREFIX + appKey);
  const headers = new Headers(res.headers);
  headers.set("x-mylan-runtime-cache", "1");
  const keys = (await cache.keys()).map((r) => r.url).filter((u) => u.includes("/session/"));
  const stale = keys.filter((u) => u === key || (rule.version_param && sameResourceOtherVersion(u, key, rule.version_param)));
  for (const u of stale) await cache.delete(u);
  await cache.put(key, new Response(blob, { status: 200, headers }));
  if (Number.isFinite(rule.max_entries)) {
    const mine = keys.filter((u) => !stale.includes(u) && sessionPathOf(u).startsWith(rule.prefix));
    const extra = mine.length + 1 - rule.max_entries;
    for (let i = 0; i < extra; i++) await cache.delete(mine[i]);
  }
  await runtimeQuotaGuard(appKey);
}
