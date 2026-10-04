/**
 * Chiave di sessione per app: ogni app salvata ha il proprio spazio /session/<chiave>/, la propria cache,
 * la propria copia della pagina iniziale e il proprio prefisso di Web Storage.
 * La chiave deriva dall'id stabile dell'app (non dal titolo, che puo' cambiare) e non espone il codice d'invito.
 */
export const SESSION_CACHE_PREFIX = "mylan-session-v3:";
export const STORAGE_NS_PREFIX = "mylan-app:";

function hash32(text, seed, mul) {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), mul) >>> 0;
  return h.toString(36).padStart(7, "0");
}

export function sessionKeyOf(app) {
  const id = String(app?.id || app?.code || "app");
  return "a" + hash32(id, 2166136261, 16777619) + hash32(id, 5381, 33);
}

export function isSessionKey(key) {
  return typeof key === "string" && /^a[0-9a-z]{14}$/.test(key);
}

export function sessionBaseUrl(key) {
  const loc = window.location;
  const base = loc.pathname.replace(/\/session\/.*$/, "/").replace(/\/index\.html.*$/, "/").replace(/\/?$/, "/");
  return loc.origin + base + "session/" + key + "/";
}

export function sessionCacheName(key) {
  return SESSION_CACHE_PREFIX + key;
}

export function storagePrefix(key) {
  return STORAGE_NS_PREFIX + key + ":";
}
