/**
 * WebSocket delle app sul DataChannel (docs/APP_SPEC.md §4.4). Lo shim nell'iframe (frame-ws-shim.js) manda
 * "mylan:ws-open" con una MessagePort; qui la connessione diventa cornici sul canale "mylan-api" dell'host dell'app:
 * ws-open {id, path, headers, protocols}, ws-msg {id, text | bin, more}, ws-close {id, code, reason}; dall'host
 * ws-accept {id, protocol}. Messaggi lunghi in piu' ws-msg (more = true fino all'ultimo). Canale chiuso o sostituito
 * (riconnessione) = chiusura 1006 per l'app, che si ricollega da se'. Solo per le app con "websocket": true.
 */
import { waitForChannel } from "./sw-channel-selector.js?v=47145387c383";
import { sessionKeyOf } from "./session-key.js?v=47145387c383";
import { websocketAllowed } from "./ws-optin.js?v=47145387c383";

const PART_CHARS = 8000; // testo per cornice: anche con molti caratteri da escapare resta sotto i 64 KB del canale
let counter = 0;

const toB64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;

/** Avvia il tunnel per l'iframe dell'app; stop() chiude (1001) tutte le sue connessioni. */
export function startWsTunnel(iframe, appData) {
  const open = new Set();
  const onMessage = (evt) => {
    if (evt.data?.type !== "mylan:ws-open" || evt.source !== iframe.contentWindow || !evt.ports?.[0]) return;
    const conn = { port: evt.ports[0], finish: null, done: () => open.delete(conn) };
    open.add(conn);
    tunnel(conn, evt.data, appData).catch(() => conn.done());
  };
  window.addEventListener("message", onMessage);
  return { stop() { window.removeEventListener("message", onMessage); for (const c of open) c.finish?.(1001, "going_away", true); } };
}

async function tunnel(conn, req, appData) {
  const { port } = conn, id = `w_${Date.now().toString(36)}_${++counter}`, path = String(req.path || "/");
  const channel = await waitForChannel(path, 10000, null, sessionKeyOf(appData));
  const allowed = await websocketAllowed(appData, channel);
  if (allowed === false) { conn.done(); return port.postMessage({ type: "refused" }); } // senza dichiarazione: muto
  let parts = [], closed = false;
  const toHost = (msg) => { try { channel.send(JSON.stringify({ type: msg.type, id, ...msg })); } catch {} };
  const finish = conn.finish = (code, reason, tellHost) => {
    if (closed) return;
    closed = true;
    conn.done();
    if (tellHost && channel) toHost({ type: "ws-close", code, reason });
    channel?.removeEventListener("message", onFrame);
    channel?.removeEventListener("close", onLost);
    port.postMessage({ type: "close", code, reason: reason || "" });
    port.close();
  };
  const onLost = () => finish(1006, "channel_closed", false);
  const onFrame = (e) => {
    if (typeof e.data !== "string" || !e.data.includes(id)) return;
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    if (m.id !== id) return;
    if (m.type === "ws-accept") port.postMessage({ type: "open", protocol: m.protocol || "" });
    else if (m.type === "ws-close") finish(m.code || 1005, m.reason, false);
    else if (m.type === "ws-msg") {
      parts.push(m.text ?? m.bin ?? "");
      if (m.more) return;
      const data = parts.join("");
      parts = [];
      if (m.text != null) port.postMessage({ type: "message", text: data });
      else { const bin = fromB64(data); port.postMessage({ type: "message", bin }, [bin]); }
    }
  };
  if (!channel || channel.readyState !== "open" || !allowed) return finish(1006, "host_unreachable", false);
  channel.addEventListener("message", onFrame);
  channel.addEventListener("close", onLost);
  port.onmessage = (e) => {
    const m = e.data || {};
    if (m.type === "close") return finish(m.code || 1000, m.reason, true);
    if (m.type !== "send" || closed) return;
    const key = m.text != null ? "text" : "bin", data = m.text != null ? String(m.text) : toB64(m.bin);
    const step = key === "text" ? PART_CHARS : PART_CHARS * 6;
    for (let i = 0; i < Math.max(data.length, 1); i += step) {
      toHost({ type: "ws-msg", [key]: data.slice(i, i + step), more: i + step < data.length });
    }
  };
  toHost({ type: "ws-open", path, headers: {}, protocols: Array.isArray(req.protocols) ? req.protocols.slice(0, 8) : [] });
}
