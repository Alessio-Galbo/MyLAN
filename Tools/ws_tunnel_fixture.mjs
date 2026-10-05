// Pagine di prova per Tools/test_ws_tunnel.mjs: un server che serve i file di MyLAN e due pagine finte.
// /__ws/parent.html: il "visualizzatore" con il tunnel vero (src/loader/ws-tunnel.js) e un host finto al posto del
// DataChannel (accetta /api/v1/ws/sync, rifiuta il resto con 1008, rimanda indietro testo e binario, "big" = risposta in
// 3 pezzi, "close" = chiusura 4001 dall'host). ?optin=0: app senza "websocket": true.
// /session/<chiave>/frame.html: la pagina dell'app con lo shim vero (src/loader/frame-ws-shim.js) iniettato come testo.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const MIME = { ".js": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css" };

const HOST_JS = `
export class FakeHost extends EventTarget {
  constructor() { super(); this.readyState = "open"; this.label = "mylan-api"; this.frames = []; this.parts = {}; }
  reply(m) { setTimeout(() => this.readyState === "open" && this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(m) })), 5); }
  lose() { this.readyState = "closed"; this.dispatchEvent(new Event("close")); }
  send(raw) {
    const m = JSON.parse(raw); this.frames.push(m);
    if (m.type === "ws-open") return this.reply(m.path.split("?")[0] === "/api/v1/ws/sync" ? { type: "ws-accept", id: m.id, protocol: m.protocols[0] || null }
      : { type: "ws-close", id: m.id, code: 1008, reason: "remote_forbidden" });
    if (m.type !== "ws-msg") return;
    const key = m.text != null ? "text" : "bin";
    this.parts[m.id] = (this.parts[m.id] || "") + m[key];
    if (m.more) return;
    const data = this.parts[m.id]; delete this.parts[m.id];
    if (data === "big") { const s = "x".repeat(9000); [0, 1, 2].forEach((i) => this.reply({ type: "ws-msg", id: m.id, text: i ? s : "[" , more: i < 2 })); return; }
    if (data === "close") return this.reply({ type: "ws-close", id: m.id, code: 4001, reason: "bye" });
    this.reply({ type: "ws-msg", id: m.id, [key]: key === "text" ? "echo:" + data.length + ":" + data.slice(0, 20) : data, more: false });
  }
}`;

function parentHtml(v) {
  return `<!doctype html><meta charset="utf-8"><body><script type="module">
import { setActiveChannels, setWantedOwner } from "/src/webrtc/channel.js?v=${v}";
import { startWsTunnel } from "/src/loader/ws-tunnel.js?v=${v}";
import { sessionKeyOf } from "/src/loader/session-key.js?v=${v}";
import { FakeHost } from "/__ws/host.js";
const app = { id: "app-ws-test", websocket: new URLSearchParams(location.search).get("optin") !== "0" };
const key = sessionKeyOf(app);
window.__connect = () => { window.__host = new FakeHost(); setActiveChannels({ api: window.__host, media: window.__host, owner: key }); };
setWantedOwner(key); window.__connect();
const iframe = document.createElement("iframe");
iframe.src = "/session/" + key + "/frame.html";
document.body.append(iframe);
window.__tunnel = startWsTunnel(iframe, app);
window.__key = key;
</script>`;
}

/** Espressione per la pagina: apre un WebSocket nell'app (W = sua window) e registra gli eventi in __log[n]. */
export const openExpr = (W, url, extra = "") => `(() => { const w = ${W}; const n = w.__log.length; const l = w.__log[n] = [];
  const s = w.__s = new w.WebSocket(${JSON.stringify(url)}, ["p1"]); ${extra}
  s.onopen = () => l.push("open:" + s.protocol); s.onerror = () => l.push("error");
  s.onmessage = (e) => l.push("msg:" + (typeof e.data === "string" ? e.data.length + ":" + e.data.slice(0, 30) : "bin:" + new Uint8Array(e.data).join(",")));
  s.onclose = (e) => l.push("close:" + e.code + ":" + e.wasClean); return n; })()`;

export async function startFixture(root, port) {
  const { installWebSocketShim } = await import(pathToFileURL(path.join(root, "src/loader/frame-ws-shim.js")).href);
  const v = JSON.parse(fs.readFileSync(path.join(root, "version.json"), "utf8")).version;
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    const send = (type, body) => { res.writeHead(200, { "content-type": type, "cache-control": "no-store" }); res.end(body); };
    if (u.pathname === "/__ws/parent.html") return send("text/html", parentHtml(v));
    if (u.pathname === "/__ws/host.js") return send("text/javascript", HOST_JS);
    const frame = u.pathname.match(/^\/session\/([a-z0-9]+)\/frame\.html$/);
    if (frame) return send("text/html", `<!doctype html><meta charset="utf-8"><script>(${installWebSocketShim.toString()})(
      ${JSON.stringify(`http://127.0.0.1:${port}/session/${frame[1]}/`)}); window.__log = [];</script><body>app</body>`);
    const file = path.join(root, decodeURIComponent(u.pathname));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    send(MIME[path.extname(file)] || "application/octet-stream", fs.readFileSync(file));
  });
  srv.closeAll = () => new Promise((r) => { srv.closeAllConnections(); srv.close(r); });
  return new Promise((r) => srv.listen(port, "127.0.0.1", () => r(srv)));
}
