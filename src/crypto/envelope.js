/**
 * Cifratura e decifratura a busta sigillata (AES-256-GCM) per il signaling effimero.
 */
export async function sealEnvelope(data, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function unsealEnvelope(b64, key) {
  try {
    let str = (b64 || "").replace(/-/g, "+").replace(/_/g, "/");
    while (str.length % 4) str += "=";
    const raw = Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
    if (raw.length < 28) return null;
    const iv = raw.slice(0, 12);
    const data = raw.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch {
    return null;
  }
}
