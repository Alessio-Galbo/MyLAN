/**
 * Adattatore Fetch su WebRTC DataChannel per MyLAN.
 */
import { getOrCreateDeviceId } from "../webrtc/device-id.js";
import { unpackBinaryChunk } from "./channel-binary.js";

let reqCounter = 0;

function safeBtoa(str) {
  try { return btoa(unescape(encodeURIComponent(str))); } catch { return ""; }
}

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

    const handler = (evt) => {
      if (evt.data instanceof ArrayBuffer) {
        const bin = unpackBinaryChunk(evt.data);
        if (!bin || bin.id !== reqId) return;
        if (streamController) streamController.enqueue(bin.payload);
        if (!bin.more && streamController) {
          streamController.close();
          channel.removeEventListener("message", handler);
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
            channel.removeEventListener("message", handler);
          }
        } else if (msg.type === "error") {
          channel.removeEventListener("message", handler);
          if (streamController) streamController.error(new Error(msg.error));
          reject(new Error(msg.error));
        }
      } catch {}
    };

    channel.addEventListener("message", handler);
    const devId = getOrCreateDeviceId();
    const reqHeaders = { ...(opts.headers || {}), "x-device-id": devId };
    channel.send(JSON.stringify({
      id: reqId,
      method: (opts.method || "GET").toUpperCase(),
      path,
      device_id: devId,
      headers: reqHeaders,
      body: opts.body ? safeBtoa(opts.body) : "",
      body_b64: opts.body ? safeBtoa(opts.body) : ""
    }));
  });
}
