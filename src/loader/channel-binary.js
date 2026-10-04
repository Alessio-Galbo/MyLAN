/**
 * Decodifica dei frame binari di chunk per WebRTC DataChannel (docs/APP_SPEC.md §4.3).
 * Header: [0x42 (1B)] [id_len (1B)] [more (1B)] [id_ascii (NB)] [payload...]
 */
export function unpackBinaryChunk(buffer) {
  if (!(buffer instanceof ArrayBuffer)) return null;
  if (buffer.byteLength < 4) return null;
  const view = new DataView(buffer);
  if (view.getUint8(0) !== 0x42) return null;
  const idLen = view.getUint8(1);
  if (buffer.byteLength < 3 + idLen) return null;
  const more = view.getUint8(2) === 1;
  const idBytes = new Uint8Array(buffer, 3, idLen);
  const id = new TextDecoder("ascii").decode(idBytes);
  const payloadBuffer = buffer.slice(3 + idLen);
  return { id, more, payload: new Uint8Array(payloadBuffer), buffer: payloadBuffer };
}

/** Frame binario nello stesso formato, usato per i corpi di richiesta inviati a pezzi (APP_SPEC §4.1). */
export function packBinaryChunk(id, more, bytes) {
  const idBytes = new TextEncoder().encode(id);
  const out = new Uint8Array(3 + idBytes.length + bytes.byteLength);
  out[0] = 0x42;
  out[1] = idBytes.length;
  out[2] = more ? 1 : 0;
  out.set(idBytes, 3);
  out.set(bytes, 3 + idBytes.length);
  return out.buffer;
}
