/**
 * Server ICE: STUN pubblici di default, nessun TURN incluso (scelta di progetto: niente relay a pagamento o con limiti).
 * L'host di un'app puo' mandare i propri server (campo facoltativo `ice` nella risposta cifrata, es. un suo TURN):
 * vengono uniti ai default e ricordati per app, cosi' anche le riconnessioni li usano.
 */
const DEFAULT_ICE = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" }
];
const STORE_PREFIX = "mylan-ice:";

const urlsOf = (server) => [].concat(server?.urls || []);

/** Default + server dell'host (solo voci con URL stun:/turn:/turns:, senza doppioni). */
export function buildIceConfig(hostIce) {
  const seen = new Set(DEFAULT_ICE.flatMap(urlsOf));
  const extra = [];
  for (const s of Array.isArray(hostIce) ? hostIce : []) {
    const urls = urlsOf(s).filter((u) => typeof u === "string" && /^(stun|turns?):/i.test(u) && !seen.has(u));
    if (!urls.length) continue;
    urls.forEach((u) => seen.add(u));
    const entry = { urls };
    if (typeof s.username === "string") entry.username = s.username;
    if (typeof s.credential === "string") entry.credential = s.credential;
    extra.push(entry);
  }
  return { iceServers: [...DEFAULT_ICE, ...extra] };
}

export function hasTurn(config) {
  return config.iceServers.some((s) => urlsOf(s).some((u) => /^turns?:/i.test(u)));
}

/** Ricorda (o dimentica, se assente) i server mandati dall'host dell'app "owner" (chiave di sessione). */
export function rememberHostIce(owner, ice) {
  if (!owner) return;
  try {
    if (Array.isArray(ice) && ice.length) localStorage.setItem(STORE_PREFIX + owner, JSON.stringify(ice));
    else localStorage.removeItem(STORE_PREFIX + owner);
  } catch {}
}

export function hostIceFor(owner) {
  try {
    const list = JSON.parse(localStorage.getItem(STORE_PREFIX + owner) || "null");
    return Array.isArray(list) ? list : null;
  } catch {
    return null;
  }
}
