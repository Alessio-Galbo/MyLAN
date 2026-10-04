/**
 * Guardia sulla quota per le cache di runtime (lato Service Worker, dopo ogni salvataggio di src/loader/sw-runtime-store.js,
 * al massimo una verifica al minuto). Nessun numero fisso di voci: solo se lo spazio usato dall'origine supera l'80%
 * della quota (navigator.storage.estimate) escono le voci di runtime piu' vecchie (ordine di inserimento) finche' si
 * torna al 70%: prima quelle delle altre app, per ultime quelle dell'app che ha appena salvato. Mai le pagine e i file
 * delle app (mylan-session-*), mai i dati delle app (IndexedDB, Web Storage): un'origine oltre quota rischia di perderli.
 */
const QUOTA_HIGH = 0.8, QUOTA_LOW = 0.7, QUOTA_CHECK_MS = 60000;
self.runtimeQuotaState = { at: 0 };
self.runtimeEstimate = () => self.navigator.storage.estimate(); // sostituibile nei test

async function entrySize(cache, req) {
  const res = await cache.match(req);
  if (!res) return 0;
  return Number(res.headers.get("content-length")) || (await res.blob()).size;
}

async function runtimeQuotaGuard(appKey) {
  if (Date.now() - self.runtimeQuotaState.at < QUOTA_CHECK_MS) return 0;
  self.runtimeQuotaState.at = Date.now();
  let est = null;
  try { est = await self.runtimeEstimate(); } catch {}
  if (!est?.quota || !(est.usage > est.quota * QUOTA_HIGH)) return 0;
  let toFree = est.usage - est.quota * QUOTA_LOW, removed = 0;
  const own = RUNTIME_PREFIX + appKey;
  const names = (await caches.keys()).filter((n) => n.startsWith(RUNTIME_PREFIX) && n !== own).concat(own);
  for (const name of names) {
    const cache = await caches.open(name);
    for (const req of await cache.keys()) { // dalla piu' vecchia
      if (toFree <= 0) return removed;
      if (!req.url.includes("/session/")) continue; // le regole dell'app restano
      toFree -= await entrySize(cache, req);
      await cache.delete(req);
      removed++;
    }
  }
  return removed;
}
