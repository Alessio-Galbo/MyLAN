/**
 * Adattatore Fetch su WebRTC DataChannel per MyLAN. Ogni richiesta finisce sempre: risposta completa, errore
 * dell'host, canale chiuso, annullamento (opts.signal) o host muto oltre opts.timeoutMs (channel-timeout.js).
 */
import { getOrCreateDeviceId } from "../webrtc/device-id.js?v=e19f7df8665d";
import { unpackBinaryChunk } from "./channel-binary.js?v=e19f7df8665d";
import { sendRequestWithBody } from "./channel-body.js?v=e19f7df8665d";
import { requestIdleTimer, IDLE_TIMEOUT_MS } from "./channel-timeout.js?v=e19f7df8665d";

let reqCounter = 0;
const NULL_BODY = [101, 204, 205, 304];

export function sendChannelRequest(channel, path, opts = {}) {
  return new Promise((resolve, reject) => {
    if (!channel || channel.readyState !== "open") {
      return reject(new Error("DataChannel not ready"));
    }
    if (opts.signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const reqId = `r_${Date.now()}_${++reqCounter}`;
    let streamController = null;

    const stream = new ReadableStream({
      start(ctrl) { streamController = ctrl; }
    });

    const done = () => {
      idle.stop();
      channel.removeEventListener("message", handler);
      channel.removeEventListener("close", onClose);
      opts.signal?.removeEventListener("abort", onAbort);
    };
    const fail = (err) => {  // dopo "start" la Promise e' gia' risolta: l'errore arriva a chi legge il corpo
      done();
      try { streamController?.error(err); } catch {}
      reject(err);
    };
    const onClose = () => fail(new Error("DataChannel closed"));  // niente richieste appese
    const onAbort = () => {
      try { channel.send(JSON.stringify({ id: reqId, type: "abort" })); } catch {}
      fail(new DOMException("Aborted", "AbortError"));
    };
    const idle = requestIdleTimer(channel, reqId, fail, opts.timeoutMs || IDLE_TIMEOUT_MS);
    const end = () => { try { streamController.close(); } catch {} done(); };
    const handler = (evt) => {
      if (evt.data instanceof ArrayBuffer) {
        const bin = unpackBinaryChunk(evt.data);
        if (!bin || bin.id !== reqId) return;
        idle.touch();
        streamController.enqueue(bin.payload);
        if (!bin.more) end();
        return;
      }
      try {
        const msg = JSON.parse(evt.data);
        if (msg.id !== reqId) return;
        idle.touch();
        if (msg.type === "start") {
          const status = msg.status || 200;  // 204/304: un Response con corpo lancerebbe e la richiesta resterebbe appesa
          resolve(new Response(NULL_BODY.includes(status) ? null : stream, { status, headers: msg.headers || {} }));
        } else if (msg.type === "chunk") {
          if (msg.data) streamController.enqueue(Uint8Array.from(atob(msg.data), (c) => c.charCodeAt(0)));
          if (!msg.more) end();
        } else if (msg.type === "error") {
          fail(new Error(msg.error));
        }
      } catch {}
    };

    channel.addEventListener("message", handler);
    channel.addEventListener("close", onClose);
    opts.signal?.addEventListener("abort", onAbort);
    const devId = getOrCreateDeviceId();
    const reqHeaders = { ...(opts.headers || {}), "x-device-id": devId };
    const msg = { id: reqId, method: (opts.method || "GET").toUpperCase(), path, device_id: devId, headers: reqHeaders };
    sendRequestWithBody(channel, msg, opts.body, opts.signal).catch(fail);
  });
}
