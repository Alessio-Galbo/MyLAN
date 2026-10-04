/**
 * Derivazione crittografica di chiavi simmetriche tramite WebCrypto HKDF-SHA256.
 */
const SALT = new TextEncoder().encode("MyLAN-Remote-V1-Salt");

export function normalizeToken(token) {
  const str = String(token || "").trim();
  return (str.length <= 16) ? str.replace(/[^A-Za-z0-9]/g, "").toUpperCase() : str;
}

export async function deriveKey(token) {
  const enc = new TextEncoder();
  const clean = normalizeToken(token);
  const rawKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(clean),
    { name: "HKDF" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: SALT,
      info: enc.encode("handshake")
    },
    rawKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}
