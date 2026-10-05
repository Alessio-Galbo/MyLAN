/**
 * Streamer di richieste e risposte a pezzi su WebRTC DataChannel per Service Worker.
 * La pagina iniziale ("/") viene raccolta come byte e decodificata UTF-8 una sola volta alla fine,
 * sia con chunk JSON base64 sia con frame binari. Un host muto oltre opts.timeoutMs fa fallire la richiesta con 504
 * (channel-timeout.js), invece di lasciarla appesa.
 */
import { getOrCreateDeviceId } from "../webrtc/device-id.js?v=1669042733e9";
import { unpackBinaryChunk } from "./channel-binary.js?v=1669042733e9";
import { sendRequestWithBody } from "./channel-body.js?v=1669042733e9";
import { requestIdleTimer, IDLE_TIMEOUT_MS } from "./channel-timeout.js?v=1669042733e9";

let reqCounter = 0;

function joinBytes(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

export function sendStreamingChannelRequest(channel, path, opts = {}, onStart, onChunk, onRootDone) {
  return new Promise((resolve, reject) => {
    if (!channel || channel.readyState !== "open") {
      return reject(new Error("DataChannel not ready"));
    }
    const reqId = `r_${Date.now()}_${++reqCounter}`;
    const isRoot = path === "/" || path === "/index.html";
    const rootParts = [];

    let idle = null;
    const finish = () => {
      idle?.stop();
      channel.removeEventListener("message", handler);
      channel.removeEventListener("close", onClose);
      opts.signal?.removeEventListener("abort", onAbort);
    };
    // Canale chiuso (host perso, o canale muto chiuso da viewer-watchdog.js): la richiesta fallisce, non resta appesa.
    const onClose = () => { finish(); reject(Object.assign(new Error("DataChannel closed"), { status: 503 })); };

    const onAbort = () => {
      finish();
      try { channel.send(JSON.stringify({ id: reqId, type: "abort" })); } catch {}
      reject(new DOMException("Aborted", "AbortError"));
    };

    const complete = () => {
      finish();
      if (isRoot) onRootDone?.(new TextDecoder().decode(joinBytes(rootParts)));
      resolve();
    };

    if (opts.signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    opts.signal?.addEventListener("abort", onAbort);
    idle = requestIdleTimer(channel, reqId, (err) => { finish(); reject(err); }, opts.timeoutMs || IDLE_TIMEOUT_MS);

    const handler = (evt) => {
      if (evt.data instanceof ArrayBuffer) {
        const bin = unpackBinaryChunk(evt.data);
        if (!bin || bin.id !== reqId) return;
        idle.touch();
        if (isRoot) rootParts.push(bin.payload);
        else onChunk?.({ binary: bin.payload, buffer: bin.buffer, more: bin.more });
        if (!bin.more) complete();
        return;
      }
      try {
        const msg = JSON.parse(evt.data);
        if (msg.id !== reqId) return;
        idle.touch();
        if (msg.type === "start") {
          onStart?.(msg);
        } else if (msg.type === "chunk") {
          if (isRoot && msg.data) rootParts.push(Uint8Array.from(atob(msg.data), (c) => c.charCodeAt(0)));
          else if (!isRoot) onChunk?.(msg);
          if (!msg.more) complete();
        } else if (msg.type === "error") {
          finish(); reject(new Error(msg.error));
        }
      } catch {}
    };

    channel.addEventListener("message", handler);
    channel.addEventListener("close", onClose);
    const devId = getOrCreateDeviceId();
    const reqHeaders = { ...(opts.headers || {}), "x-device-id": devId };
    const msg = { id: reqId, method: (opts.method || "GET").toUpperCase(), path, device_id: devId, headers: reqHeaders };
    sendRequestWithBody(channel, msg, opts.body, opts.signal).catch((err) => { finish(); reject(err); });
  });
}
