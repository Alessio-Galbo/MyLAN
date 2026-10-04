/**
 * Spazio di nomi per app dentro l'iframe (iniettato come testo da sandbox-bridge.js, prima degli script dell'app).
 * localStorage / sessionStorage dell'app vedono solo le chiavi col prefisso dell'app: niente collisioni fra app,
 * nessuna chiave di MyLAN (registro, token di ritorno) visibile, e clear() cancella solo i dati dell'app.
 * CacheStorage: le cache interne di MyLAN ("mylan-...") sono nascoste e non cancellabili dall'app.
 * NON e' un confine di sicurezza: stessa origine, vedi docs/INTEGRATION.md §8.
 * La funzione deve restare autosufficiente: viene serializzata con toString().
 */
export function installStorageShim(prefix) {
  const wrap = (raw) => {
    const own = () => {
      const out = [];
      for (let i = 0; i < raw.length; i++) {
        const k = raw.key(i);
        if (k !== null && k.startsWith(prefix)) out.push(k.slice(prefix.length));
      }
      return out;
    };
    const api = {
      getItem: (k) => raw.getItem(prefix + String(k)),
      setItem: (k, v) => raw.setItem(prefix + String(k), String(v)),
      removeItem: (k) => raw.removeItem(prefix + String(k)),
      clear: () => own().forEach((k) => raw.removeItem(prefix + k)),
      key: (i) => own()[i] ?? null
    };
    const has = (p) => typeof p === "string" && raw.getItem(prefix + p) !== null;
    return new Proxy(Object.create(Storage.prototype), {
      get(target, p) {
        if (p === "length") return own().length;
        if (Object.hasOwn(api, p)) return api[p];
        if (typeof p === "symbol") return Reflect.get(target, p);
        return has(p) ? raw.getItem(prefix + p) : undefined;
      },
      set(target, p, v) { if (typeof p === "string") api.setItem(p, v); return true; },
      deleteProperty(target, p) { if (typeof p === "string") api.removeItem(p); return true; },
      has: (target, p) => has(p) || Object.hasOwn(api, p),
      ownKeys: () => own(),
      getOwnPropertyDescriptor: (target, p) => has(p)
        ? { value: raw.getItem(prefix + p), writable: true, enumerable: true, configurable: true }
        : undefined
    });
  };
  for (const name of ["localStorage", "sessionStorage"]) {
    try {
      const raw = window[name];
      if (raw) Object.defineProperty(window, name, { value: wrap(raw), configurable: true, enumerable: true });
    } catch {}
  }
  try {
    const cs = window.caches;
    const internal = (n) => String(n).startsWith("mylan-");
    const keys = cs.keys.bind(cs), del = cs.delete.bind(cs), open = cs.open.bind(cs), hasCache = cs.has.bind(cs);
    cs.keys = () => keys().then((list) => list.filter((n) => !internal(n)));
    cs.delete = (n) => internal(n) ? Promise.resolve(false) : del(n);
    cs.has = (n) => internal(n) ? Promise.resolve(false) : hasCache(n);
    cs.open = (n) => internal(n) ? Promise.reject(new DOMException("Reserved cache name", "SecurityError")) : open(n);
  } catch {}
}
