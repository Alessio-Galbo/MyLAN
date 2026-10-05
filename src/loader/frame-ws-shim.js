/**
 * WebSocket dell'app nell'iframe (iniettato come testo da sandbox-bridge.js; autosufficiente: serializzato con toString).
 * Un WebSocket verso l'origine dell'app (ws(s)://<host di MyLAN>/..., anche sotto /session/<chiave>/) passa a MyLAN su una
 * MessagePort e MyLAN lo porta sul DataChannel (src/loader/ws-tunnel.js), solo se l'app dichiara "websocket": true; senza,
 * resta muto come prima (mai aperto). Altri indirizzi: WebSocket del browser. Canale caduto = "error" + chiusura 1006.
 */export function installWebSocketShim(base) {
  const Native = window.WebSocket;
  if (!Native || Native.mylanTunnel) return;
  const basePath = new URL(base, location.href).pathname;
  const appPath = (u) => {
    let url;
    try { url = new URL(String(u), location.href); } catch { return null; }
    if (url.host !== location.host) return null;
    const p = url.pathname.startsWith(basePath) ? "/" + url.pathname.slice(basePath.length) : url.pathname;
    return p + url.search;
  };
  const STATES = { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 };

  class TunnelSocket extends EventTarget {
    constructor(url, protocols, path) {
      super();
      Object.assign(this, { url: String(url), readyState: 0, protocol: "", extensions: "", bufferedAmount: 0,
        binaryType: "blob", onopen: null, onmessage: null, onerror: null, onclose: null });
      for (const t of ["open", "message", "error", "close"]) {
        this.addEventListener(t, (e) => { if (typeof this["on" + t] === "function") this["on" + t].call(this, e); });
      }
      const ch = new MessageChannel();
      this._port = ch.port1;
      this._queue = Promise.resolve();
      ch.port1.onmessage = (e) => this._from(e.data || {});
      const list = protocols == null ? [] : [].concat(protocols).map(String);
      parent.postMessage({ type: "mylan:ws-open", path, protocols: list }, "*", [ch.port2]);
    }

    _from(m) {
      if (m.type === "refused") this._refused = true; // app senza "websocket": true, come prima di MyLAN 2026-10-05
      else if (m.type === "open" && this.readyState === 0) {
        this.readyState = 1;
        this.protocol = m.protocol || "";
        this.dispatchEvent(new Event("open"));
      } else if (m.type === "message" && this.readyState === 1) {
        const data = m.text != null ? m.text : (this.binaryType === "blob" ? new Blob([m.bin]) : m.bin);
        this.dispatchEvent(new MessageEvent("message", { data, origin: location.origin }));
      } else if (m.type === "close") this._closed(m.code || 1005, m.reason || "");
    }

    _closed(code, reason) {
      if (this.readyState === 3) return;
      this.readyState = 3;
      if (code === 1006) this.dispatchEvent(new Event("error"));
      this.dispatchEvent(new CloseEvent("close", { code, reason, wasClean: code !== 1006 }));
      try { this._port.close(); } catch {}
    }

    send(data) {
      if (this.readyState === 0) throw new DOMException("Still in CONNECTING state.", "InvalidStateError");
      if (this.readyState !== 1) return;
      const port = this._port;
      this._queue = this._queue.then(async () => { // in ordine anche con Blob (lettura asincrona)
        if (typeof data === "string") return port.postMessage({ type: "send", text: data });
        const buf = data instanceof Blob ? await data.arrayBuffer()
          : ArrayBuffer.isView(data) ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
          : data instanceof ArrayBuffer ? data.slice(0) : new TextEncoder().encode(String(data)).buffer;
        port.postMessage({ type: "send", bin: buf }, [buf]);
      }).catch(() => {});
    }

    close(code, reason) {
      if (code !== undefined && code !== 1000 && (code < 3000 || code > 4999)) {
        throw new DOMException("Invalid close code", "InvalidAccessError");
      }
      if (this.readyState >= 2) return;
      this.readyState = 2;
      if (this._refused) return this._closed(code || 1000, reason || "");
      this._port.postMessage({ type: "close", code: code || 1000, reason: String(reason || "") });
    }
  }
  Object.assign(TunnelSocket, STATES);
  Object.assign(TunnelSocket.prototype, STATES);

  function WebSocket(url, protocols) {
    const path = appPath(url);
    return path === null ? new Native(url, protocols) : new TunnelSocket(url, protocols, path);
  }
  Object.assign(WebSocket, STATES, { mylanTunnel: true });
  WebSocket.prototype = Native.prototype;
  window.WebSocket = WebSocket;
}
