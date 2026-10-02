/**
 * Decodifica dei frame binari di chunk per WebRTC DataChannel (Docs/09_Bis).
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
