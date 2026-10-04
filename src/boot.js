/**
 * Avvio di MyLAN: carica i moduli di una sola pubblicazione, senza aspettare la rete.
 * - Tutti gli import portano "?v=<versione>" (Tools/stamp.mjs) e la versione e' scritta qui sotto: con il Service
 *   Worker che custodisce i file di MyLAN (cache "mylan-shell-v1") si parte SUBITO con questa. Il Service Worker
 *   (src/loader/sw-shell.js) serve i file timbrati dalla cache e rifiuta (503) quelli che la rete darebbe di un'altra
 *   pubblicazione; le pubblicazioni nuove le scarica lui in background, tutte intere, per il lancio dopo.
 * - Altrimenti (primo avvio, Service Worker vecchio o assente, import fallito): version.json senza cache, al massimo
 *   3 s, e la versione che dice. I fogli di stile di un index.html vecchio passano alla stessa versione.
 */
const MYLAN_VERSION = "e19f7df8665d";

async function deployedVersion(timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(new URL("../version.json", import.meta.url), { cache: "no-store", signal: ctrl.signal });
    const version = res.ok ? (await res.json()).version : "";
    if (/^[0-9a-f]{12}$/.test(version)) return version;
  } catch {} finally { clearTimeout(timer); }
  return "";
}

function alignStyles(version) {
  for (const link of document.querySelectorAll('link[rel="stylesheet"][href*="?v="]')) {
    const url = new URL(link.href);
    if (url.searchParams.get("v") !== version) { url.searchParams.set("v", version); link.href = url.href; }
  }
}

async function start(version) {
  if (version) alignStyles(version);
  await import(version ? `./app.js?v=${version}` : "./app.js");
}

async function guardedBySw() {
  if (!navigator.serviceWorker?.controller) return false;
  try { return await caches.has("mylan-shell-v1"); } catch { return false; }
}

let started = false;
if (MYLAN_VERSION && (await guardedBySw())) {
  try { await start(MYLAN_VERSION); started = true; } catch (err) { console.warn("[MyLAN] boot:", err); }
}
if (!started) await start((await deployedVersion(3000)) || MYLAN_VERSION);
