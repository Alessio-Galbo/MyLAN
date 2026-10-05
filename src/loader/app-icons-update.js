/**
 * App salvate prima delle icone dichiarate (src/loader/app-icons.js): alla prima connessione MyLAN legge una volta il
 * manifest dell'app, salva le sue icone e i suoi colori, e il manifest della PWA installata si aggiorna.
 */
import { sendChannelRequest } from "./channel-fetch.js?v=47145387c383";
import { parseDeclaredIcons, cacheDeclaredIcons } from "./app-icons.js?v=47145387c383";
import { getAppSlug } from "../ui/viewer-meta.js?v=47145387c383";

const color = (c) => (typeof c === "string" ? c.slice(0, 32) : "");

export async function ensureAppIcons(channel, appData) {
  let manifest = null;
  for (const path of ["/.well-known/mylan.json", "/manifest.json"]) {
    try {
      const res = await sendChannelRequest(channel, path);
      if (res.status === 200) { manifest = await res.json(); break; }
    } catch {}
  }
  const icons = manifest ? await cacheDeclaredIcons(channel, getAppSlug(appData), parseDeclaredIcons(manifest.icons)) : [];
  if (manifest && !icons.length) appData.icons = []; // niente da usare: non si richiede a ogni connessione
  return { updateCheck: appData.updateCheck, icons, backgroundColor: color(manifest?.background_color),
    themeColor: color(manifest?.theme_color) || appData.themeColor };
}
