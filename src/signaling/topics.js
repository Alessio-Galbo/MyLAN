/**
 * Derivazione deterministica dei nomi dei topic effimeri per il relay di signaling.
 */
import { normalizeToken } from "../crypto/kdf.js?v=aa3afb9e1dd9";

export async function deriveTopic(token, prefix = "h") {
  const enc = new TextEncoder();
  const clean = normalizeToken(token);
  const hashBuf = await crypto.subtle.digest(
    "SHA-256",
    enc.encode(`ntfy-topic-${prefix}-${clean}`)
  );
  const hashHex = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `mylan-${prefix}-${hashHex.slice(0, 20)}`;
}
