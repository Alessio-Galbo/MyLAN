/**
 * Avvio di MyLAN: carica i moduli di una sola pubblicazione. version.json (letto senza cache) dice quale e tutti gli
 * import portano "?v=<versione>" (Tools/stamp.mjs): anche con un index.html vecchio ancora in cache, vecchi e nuovi
 * moduli non si mescolano mai; i fogli di stile di un index.html vecchio passano alla stessa versione. Senza rete vale
 * la versione scritta qui sotto.
 */
const MYLAN_VERSION = "76b805b937bb";

async function deployedVersion() {
  try {
    const res = await fetch(new URL("../version.json", import.meta.url), { cache: "no-store" });
    const version = res.ok ? (await res.json()).version : "";
    if (/^[0-9a-f]{12}$/.test(version)) return version;
  } catch {}
  return MYLAN_VERSION;
}

function alignStyles(version) {
  for (const link of document.querySelectorAll('link[rel="stylesheet"][href*="?v="]')) {
    const url = new URL(link.href);
    if (url.searchParams.get("v") !== version) { url.searchParams.set("v", version); link.href = url.href; }
  }
}

const version = await deployedVersion();
if (version) alignStyles(version);
await import(version ? `./app.js?v=${version}` : "./app.js");
