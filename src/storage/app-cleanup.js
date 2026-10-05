/**
 * Pulizia dei dati locali di un'app rimossa dall'Hub e migrazione una tantum dal vecchio spazio unico.
 */
import { sessionKeyOf, sessionCacheName, storagePrefix } from "../loader/session-key.js?v=47145387c383";
import { SHELL_KEY_PREFIX } from "../loader/html-patcher.js?v=47145387c383";
import { MANIFEST_CACHE } from "../ui/pwa-icon.js?v=47145387c383";
import { getAppSlug } from "../ui/viewer-meta.js?v=47145387c383";
import { rememberHostIce } from "../webrtc/ice-config.js?v=47145387c383";
import { forgetVersion, STAGING_PREFIX } from "../loader/app-updater.js?v=47145387c383";
import { RUNTIME_PREFIX } from "../loader/runtime-rules.js?v=47145387c383";

const MIGRATED_KEY = "mylan_storage_ns_v1";

function keysOf(storage) {
  const out = [];
  for (let i = 0; i < storage.length; i++) out.push(storage.key(i));
  return out;
}

/** Cancella cache del pacchetto, pagina iniziale, Web Storage dell'app, icone e manifest dell'installazione. */
export async function purgeAppData(app) {
  if (!app) return;
  const appKey = sessionKeyOf(app);
  const prefix = storagePrefix(appKey);
  try {
    localStorage.removeItem(SHELL_KEY_PREFIX + appKey);
    rememberHostIce(appKey, null); // dimentica anche i server ICE (TURN) mandati dall'host dell'app
    forgetVersion(appKey);
    keysOf(localStorage).filter((k) => k.startsWith(prefix)).forEach((k) => localStorage.removeItem(k));
    keysOf(sessionStorage).filter((k) => k.startsWith(prefix)).forEach((k) => sessionStorage.removeItem(k));
  } catch {}
  try {
    await caches.delete(sessionCacheName(appKey));
    await caches.delete(STAGING_PREFIX + appKey);
    await caches.delete(RUNTIME_PREFIX + appKey); // copertine e simili dichiarate in "runtime_cache"
    const slug = getAppSlug(app);
    const cache = await caches.open(MANIFEST_CACHE);
    for (const req of await cache.keys()) {
      if (new URL(req.url).searchParams.get("app") === slug) await cache.delete(req);
    }
  } catch {}
}

/**
 * Le versioni precedenti tenevano un'unica pagina iniziale e lasciavano alle app il localStorage grezzo.
 * Una sola volta: le chiavi che non iniziano con "mylan" vengono COPIATE nello spazio di ciascuna app gia' salvata,
 * cosi' le app ritrovano i propri dati. Gli originali restano: l'origine (<utente>.github.io) puo' essere condivisa
 * con altri siti dello stesso account, quindi MyLAN non cancella chiavi che non sa di chi siano.
 */
export function migrateLegacyStorage(savedApps) {
  try {
    if (localStorage.getItem(MIGRATED_KEY)) return;
    localStorage.removeItem("mylan_shell_html");
    const legacy = keysOf(localStorage).filter((k) => k !== null && !k.startsWith("mylan"));
    for (const app of savedApps) {
      const prefix = storagePrefix(sessionKeyOf(app));
      legacy.forEach((k) => {
        if (localStorage.getItem(prefix + k) === null) localStorage.setItem(prefix + k, localStorage.getItem(k));
      });
    }
    localStorage.setItem(MIGRATED_KEY, "1");
  } catch {}
}
