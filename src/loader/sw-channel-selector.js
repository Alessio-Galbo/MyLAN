/**
 * Selezione del canale WebRTC appropriato per il routing Service Worker.
 * Il canale "mylan-media" serve le richieste pesanti: richieste con intestazione Range oppure
 * percorsi che l'app dichiara in "media_paths" del suo /.well-known/mylan.json. Tutto il resto va su "mylan-api".
 */
import { getApiChannel, getMediaChannel, getActiveChannel, getChannelOwner } from "../webrtc/channel.js";

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

export async function waitForChannel(path, maxWaitMs = 15000, headers = null, owner = "") {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const ch = selectChannelForPath(path, headers, owner);
    if (ch && ch.readyState === "open") return ch;
    await new Promise((r) => setTimeout(r, 120));
  }
  return null;
}
