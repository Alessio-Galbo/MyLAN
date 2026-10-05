/**
 * Corpo delle richieste su DataChannel (docs/APP_SPEC.md §4.1): sempre byte esatti, mai testo reinterpretato.
 * Base64 dei byte nel solo campo "body" del JSON (formato storico, compatibile), finche' il messaggio intero sta in
 * FRAME_MAX (a=max-message-size degli host, di solito 64 KB: circa 46 KB di corpo). Prima il valore partiva anche in
 * "body_b64": doppio base64, e oltre ~24 KB di corpo il messaggio superava il limite e non partiva.
 * Oltre: frame binari 0x42 dopo il JSON, solo se l'app dichiara "chunked_uploads": true; altrimenti errore 413.
 */
import { packBinaryChunk } from "./channel-binary.js?v=1669042733e9";

export const FRAME_MAX = 64 * 1024;
const FRAME_PAYLOAD = 60 * 1024;
const HIGH_WATER = 1024 * 1024;
let chunkedUploads = false;

export function setChunkedUploads(enabled) {
  chunkedUploads = Boolean(enabled);
}

export function toBytes(body) {
  if (body === null || body === undefined || body === "") return null;
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  return new TextEncoder().encode(String(body));
}

export function bytesToBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function waitForDrain(channel) {
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); channel.removeEventListener("bufferedamountlow", done); resolve(); };
    channel.bufferedAmountLowThreshold = HIGH_WATER / 4;
    channel.addEventListener("bufferedamountlow", done);
    const timer = setTimeout(done, 2000);
  });
}

/** Invia la richiesta JSON e, se serve, il corpo a pezzi. Lancia un Error con status 413 se il corpo non puo' passare. */
export async function sendRequestWithBody(channel, msg, body, signal) {
  const bytes = toBytes(body);
  const inline = JSON.stringify({ ...msg, body: bytes ? bytesToBase64(bytes) : "" });
  if (new TextEncoder().encode(inline).length <= FRAME_MAX) {
    channel.send(inline);
    return;
  }
  if (!bytes || !chunkedUploads) {
    const err = new Error(`Request of ${inline.length} bytes exceeds the ${FRAME_MAX} bytes of one message ` +
      "and the app does not declare \"chunked_uploads\" in /.well-known/mylan.json");
    err.status = 413;
    throw err;
  }
  channel.send(JSON.stringify({ ...msg, body: "", body_size: bytes.length, body_chunked: true }));
  for (let off = 0; off < bytes.length; off += FRAME_PAYLOAD) {
    if (signal?.aborted || channel.readyState !== "open") return;
    if (channel.bufferedAmount > HIGH_WATER) await waitForDrain(channel);
    const end = Math.min(off + FRAME_PAYLOAD, bytes.length);
    channel.send(packBinaryChunk(msg.id, end < bytes.length, bytes.subarray(off, end)));
  }
}
