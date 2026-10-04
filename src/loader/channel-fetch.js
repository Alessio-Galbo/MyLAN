/**
 * Adattatore Fetch su WebRTC DataChannel per MyLAN.
 */
import { getOrCreateDeviceId } from "../webrtc/device-id.js";
import { unpackBinaryChunk } from "./channel-binary.js";
import { sendRequestWithBody } from "./channel-body.js";

let reqCounter = 0;

export function sendChannelRequest(channel, path, opts = {}) {
  return new Promise((resolve, reject) => {
    if (!channel || channel.readyState !== "open") {
      return reject(new Error("DataChannel not ready"));
    }
    const reqId = `r_${Date.now()}_${++reqCounter}`;
    let respStatus = 200;
    let respHeaders = {};
    let streamController = null;

    const stream = new ReadableStream({
      start(ctrl) { streamController = ctrl; }
    });

    const done = () => { channel.removeEventListener("message", handler); channel.removeEventListener("close", onClose); };
    const onClose = () => {  // canale chiuso prima della fine: niente richieste appese
      done();
      try { streamController?.error(new Error("DataChannel closed")); } catch {}
      reject(new Error("DataChannel closed"));
    };
    const handler = (evt) => {
      if (evt.data instanceof ArrayBuffer) {
        const bin = unpackBinaryChunk(evt.data);
        if (!bin || bin.id !== reqId) return;
        if (streamController) streamController.enqueue(bin.payload);
        if (!bin.more && streamController) {
          streamController.close();
          done();
        }
        return;
      }
      try {
        const msg = JSON.parse(evt.data);
        if (msg.id !== reqId) return;
        if (msg.type === "start") {
          respStatus = msg.status || 200;
          respHeaders = msg.headers || {};
          resolve(new Response(stream, { status: respStatus, headers: respHeaders }));
        } else if (msg.type === "chunk") {
          if (msg.data && streamController) {
            const bytes = Uint8Array.from(atob(msg.data), (c) => c.charCodeAt(0));
            streamController.enqueue(bytes);
          }
          if (!msg.more && streamController) {
            streamController.close();
            done();
          }
        } else if (msg.type === "error") {
          done();
          if (streamController) streamController.error(new Error(msg.error));
          reject(new Error(msg.error));
        }
      } catch {}
    };

    channel.addEventListener("message", handler);
    channel.addEventListener("close", onClose);
    const devId = getOrCreateDeviceId();
    const reqHeaders = { ...(opts.headers || {}), "x-device-id": devId };
    const msg = { id: reqId, method: (opts.method || "GET").toUpperCase(), path, device_id: devId, headers: reqHeaders };
    sendRequestWithBody(channel, msg, opts.body, opts.signal).catch((err) => {
      done();
      reject(err);
    });
  });
}
