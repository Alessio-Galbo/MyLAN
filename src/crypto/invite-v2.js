/**
 * Chiavi e topic dell'handshake d'invito (docs/INTEGRATION.md §5). Protocollo 2: il codice passa da PBKDF2-SHA256
 * (200k iterazioni) e poi da HKDF: chiavi AES-GCM separate per offerta e risposta, topic che non rivelano il codice.
 * Protocollo 1 (host meno recenti, link senza "p=2"): HKDF diretto sul codice e topic SHA-256, una chiave sola.
 */
import { deriveKey } from "./kdf.js?v=e19f7df8665d";
import { deriveTopic } from "../signaling/topics.js?v=e19f7df8665d";

const enc = new TextEncoder();
export const V2_ITERATIONS = 200000;
const PBKDF2_SALT = enc.encode("MyLAN-Remote-V2-Invite");
const HKDF_SALT = enc.encode("MyLAN-Remote-V2-HKDF");
const hex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
const normalizeCode = (code) => String(code || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
const fromHex = (h) => Uint8Array.from(h.match(/../g), (x) => parseInt(x, 16));

/** Byte (esadecimali) di master, chiavi e topic del protocollo 2: lento di proposito (~0,2-0,6 s). */
export async function inviteMaterialV2(code, iterations = V2_ITERATIONS) {
  const pw = await crypto.subtle.importKey("raw", enc.encode(normalizeCode(code)), "PBKDF2", false, ["deriveBits"]);
  const master = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: PBKDF2_SALT, iterations }, pw, 256);
  const hk = await crypto.subtle.importKey("raw", master, "HKDF", false, ["deriveBits"]);
  const bits = (info, n) => crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: enc.encode(info) }, hk, n);
  return {
    master: hex(master),
    offerKey: hex(await bits("v2-offer", 256)),
    answerKey: hex(await bits("v2-answer", 256)),
    offerTopic: `mylan2-offer-${hex(await bits("v2-topic-offer", 128))}`,
    answerTopic: `mylan2-answer-${hex(await bits("v2-topic-answer", 128))}`
  };
}

const aesKey = (h) => crypto.subtle.importKey("raw", fromHex(h), "AES-GCM", false, ["encrypt", "decrypt"]);

/** Protocollo di un link d'invito (query e frammento): 2 con "p" (oggi "p=2"), 1 per i link degli host meno recenti
 * (codice senza "p"), 2 senza codice nel link (codice digitato a mano). */
export function protocolOfLink(search, hash) {
  const hasCode = /[?&](?:i|code)=/.test(search || "") || /[#&](?:i|code)=/.test(hash || "");
  if (!hasCode) return 2;
  return new URLSearchParams(search || "").get("p") || /[#&]p=[^&]/.test(hash || "") ? 2 : 1;
}

/** { offerKey, answerKey, offerTopic, answerTopic } per il protocollo scelto (1 o 2). */
export async function inviteKeys(code, protocol = 2) {
  if (protocol === 1) {
    const key = await deriveKey(code);
    return { offerKey: key, answerKey: key,
      offerTopic: await deriveTopic(code, "offer"), answerTopic: await deriveTopic(code, "answer") };
  }
  const m = await inviteMaterialV2(code);
  return { offerKey: await aesKey(m.offerKey), answerKey: await aesKey(m.answerKey),
    offerTopic: m.offerTopic, answerTopic: m.answerTopic };
}
