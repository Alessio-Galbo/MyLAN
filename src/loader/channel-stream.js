/**
 * Streamer di richieste e risposte a pezzi su WebRTC DataChannel per Service Worker.
 */
import { getOrCreateDeviceId } from "../webrtc/device-id.js";
import { unpackBinaryChunk } from "./channel-binary.js";

let reqCounter = 0;

function safeBtoa(str) {
  try { return btoa(unescape(encodeURIComponent(str))); } catch { return ""; }
}

export function sendStreamingChannelRequest(channel, path, opts = {}, onStart, onChunk, onRootDone) {
  return new Promise((resolve, reject) => {
    if (!channel || channel.readyState !== "open") {
      return reject(new Error("DataChannel not ready"));
    }
    const reqId = `r_${Date.now()}_${++reqCounter}`;
    const isRoot = path === "/" || path === "/index.html";
    let rootText = "";

    const finish = () => {
      channel.removeEventListener("message", handler);
      opts.signal?.removeEventListener("abort", onAbort);
    };

    const onAbort = () => {
      finish();
      try { channel.send(JSON.stringify({ id: reqId, type: "abort" })); } catch {}
      reject(new DOMException("Aborted", "AbortError"));
    };

    if (opts.signal?.aborted) return onAbort();
    opts.signal?.addEventListener("abort", onAbort);

    const handler = (evt) => {
      if (evt.data instanceof ArrayBuffer) {
        const bin = unpackBinaryChunk(evt.data);
        if (!bin || bin.id !== reqId) return;
        onChunk?.({ binary: bin.payload, buffer: bin.buffer, more: bin.more });
        if (!bin.more) { finish(); resolve(); }
        return;
      }
      try {
        const msg = JSON.parse(evt.data);
        if (msg.id !== reqId) return;
        if (msg.type === "start") {
          onStart?.(msg);
        } else if (msg.type === "chunk") {
          if (isRoot && msg.data) rootText += atob(msg.data);
          else onChunk?.(msg);
          if (!msg.more) { finish(); if (isRoot) onRootDone?.(rootText); resolve(); }
        } else if (msg.type === "error") {
          finish(); reject(new Error(msg.error));
        }
      } catch {}
    };

    channel.addEventListener("message", handler);
    const devId = getOrCreateDeviceId();
    const reqHeaders = { ...(opts.headers || {}), "x-device-id": devId };
    channel.send(JSON.stringify({
      id: reqId, method: (opts.method || "GET").toUpperCase(), path,
      device_id: devId, headers: reqHeaders,
      body: opts.body ? safeBtoa(opts.body) : "", body_b64: opts.body ? safeBtoa(opts.body) : ""
    }));
  });
}
