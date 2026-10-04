/**
 * Selezione del canale WebRTC appropriato per il routing Service Worker.
 * Il canale "mylan-media" serve le richieste pesanti: richieste con intestazione Range oppure
 * percorsi che l'app dichiara in "media_paths" del suo /.well-known/mylan.json. Tutto il resto va su "mylan-api".
 */
import { getApiChannel, getMediaChannel, getActiveChannel, getChannelOwner } from "../webrtc/channel.js?v=e19f7df8665d";
import { isReconnecting } from "../webrtc/reconnect.js?v=e19f7df8665d";

let mediaPaths = [];

export function setMediaPaths(list) {
  mediaPaths = Array.isArray(list) ? list.filter((p) => typeof p === "string" && p.startsWith("/")) : [];
}

function isMediaRequest(path, headers) {
  const hasRange = Boolean(headers && (headers.range || headers.Range));
  return hasRange || mediaPaths.some((prefix) => path.startsWith(prefix));
}

// "owner": chiave di sessione dell'app che chiede; il canale di un altro host non le viene mai dato.
export function selectChannelForPath(path, headers = null, owner = "") {
  if (owner && getChannelOwner() !== owner) return null;
  return isMediaRequest(path, headers)
    ? (getMediaChannel() || getActiveChannel())
    : (getApiChannel() || getActiveChannel());
}

// Attende il canale solo mentre una riconnessione e' in corso (dopo 300 ms di margine per farla partire): con l'host
// spento o senza token la richiesta fallisce subito (503) e l'app mostra il suo stato offline, invece di 15 s di attesa.
export async function waitForChannel(path, maxWaitMs = 15000, headers = null, owner = "") {
  const start = Date.now(), deadline = start + maxWaitMs;
  while (Date.now() < deadline) {
    const ch = selectChannelForPath(path, headers, owner);
    if (ch && ch.readyState === "open") return ch;
    if (!isReconnecting() && Date.now() - start > 300) return null;
    await new Promise((r) => setTimeout(r, 120));
  }
  return null;
}
