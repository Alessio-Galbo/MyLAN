/**
 * Aggiornamento in background della copia in cache di un'app (cache-first: l'app si apre sempre dalla cache, poi qui
 * si controlla l'host). Versione: campo `update_check` {url, field} del /.well-known/mylan.json dell'app; senza, si
 * confronta un'impronta della pagina iniziale. Se cambia, tutti i file gia' in cache vengono riscaricati in parallelo in
 * una cache di appoggio e copiati nella cache dell'app solo a scaricamento riuscito: mai una cache vuota a meta'.
 */
import { sendChannelRequest } from "./channel-fetch.js?v=47145387c383";
import { sessionBaseUrl, sessionCacheName } from "./session-key.js?v=47145387c383";

const VERSION_PREFIX = "mylan-app-version:";
export const STAGING_PREFIX = "mylan-staging:";
export const PARALLEL = 6;

/** Esegue fn su ogni elemento con al massimo n in volo (DataChannel: l'host serve le richieste in parallelo). */
export async function parallelMap(items, n, fn) {
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

async function digest(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return "html:" + Array.from(new Uint8Array(buf).slice(0, 12)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Versione dell'app sull'host ("" se non leggibile). htmlText: pagina iniziale gia' scaricata, se c'e'. */
export async function hostVersion(channel, updateCheck, htmlText = null) {
  try {
    if (updateCheck?.url) {
      const res = await sendChannelRequest(channel, updateCheck.url);
      const data = res.status === 200 ? await res.json() : null;
      const v = data?.[updateCheck.field || "version"];
      return v === undefined || v === null ? "" : String(v);
    }
    const html = htmlText ?? (await (await sendChannelRequest(channel, "/")).text());
    return html ? await digest(html) : "";
  } catch {
    return "";
  }
}

export const storedVersion = (appKey) => { try { return localStorage.getItem(VERSION_PREFIX + appKey) || ""; } catch { return ""; } };
export const storeVersion = (appKey, v) => { try { if (v) localStorage.setItem(VERSION_PREFIX + appKey, v); } catch {} };
export const forgetVersion = (appKey) => { try { localStorage.removeItem(VERSION_PREFIX + appKey); } catch {} };

/** Riscarica in parallelo i percorsi indicati (piu' quelli gia' in cache) e li copia nella cache dell'app; con strict
 * (aggiornamento) solo se nessun file e' fallito, senza (prima installazione) i file secondari mancanti non bloccano. */
export async function refreshCachedFiles(channel, appKey, paths, onFile = null, strict = true) {
  const base = sessionBaseUrl(appKey);
  const live = await caches.open(sessionCacheName(appKey));
  const known = (await live.keys()).map((r) => r.url).filter((u) => u.startsWith(base))
    .map((u) => "/" + u.slice(base.length)).filter((p) => p !== "/" && p !== "/index.html");
  const all = [...new Set([...paths, ...known])];
  const stagingName = STAGING_PREFIX + appKey;
  await caches.delete(stagingName);
  const staging = await caches.open(stagingName);
  let failed = 0, done = 0;
  await parallelMap(all, PARALLEL, async (p) => {
    try {
      const resp = await sendChannelRequest(channel, p);
      if (resp.ok) await staging.put(new Request(new URL(p.replace(/^\//, ""), base).href), resp);
      else if (resp.status >= 500) failed++;
    } catch { failed++; }
    onFile?.(++done, all.length);
  });
  if (failed && strict) { await caches.delete(stagingName); throw new Error(`${failed} file non scaricati`); }
  for (const req of await staging.keys()) await live.put(req, await staging.match(req));
  await caches.delete(stagingName);
  return all.length;
}
