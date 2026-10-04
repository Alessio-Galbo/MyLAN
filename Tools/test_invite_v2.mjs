// Protocollo d'invito (docs/INTEGRATION.md §5): vettore fissato del protocollo 2 (deve coincidere con l'host), chiavi
// diverse per i due versi, protocollo 1 ancora disponibile per i link senza "p" e scelta del protocollo dal link.
// Uso: node Tools/test_invite_v2.mjs  (Node 18+, nessuna rete)
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const load = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href + "?v=test");
const inv = await load("src/crypto/invite-v2.js");
const env = await load("src/crypto/envelope.js");
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " - " + detail : ""}`); };

const VECTOR = {
  master: "0be70dfbc9833b3ec14c1d1e9903af5ec24de3e71dc5b717f357a35152c8794d",
  offerKey: "11ac8a124760b960a117c859b20cd0ee1d206478e9d4ec0b34928c4f2395d634",
  answerKey: "a9bcc3446196ef0864c41aac7fc8d8616f57f29f00486186c1288baa7985a50a",
  offerTopic: "mylan2-offer-08c80141ca1c0cd6723becc801bd044a",
  answerTopic: "mylan2-answer-3bb82ff2fdfea75b11439933af7b0f56"
};
const t0 = performance.now();
const got = await inv.inviteMaterialV2("k7qm-4xrd-p2hw");
const ms = Math.round(performance.now() - t0);
check("vettore del protocollo 2 (codice K7QM-4XRD-P2HW)", JSON.stringify(got) === JSON.stringify(VECTOR), `${ms} ms`);

const k2 = await inv.inviteKeys("K7QM4XRDP2HW", 2);
const sealed = await env.sealEnvelope({ type: "answer", sdp: "v=0" }, k2.answerKey);
check("busta della risposta: si apre solo con la chiave della risposta",
  (await env.unsealEnvelope(sealed, k2.answerKey))?.sdp === "v=0" && (await env.unsealEnvelope(sealed, k2.offerKey)) === null);
check("i topic del protocollo 2 non contengono il codice", !/K7QM/i.test(k2.offerTopic + k2.answerTopic));

const k1 = await inv.inviteKeys("K7QM-4XRD-P2HW", 1);
check("protocollo 1: topic mylan-offer-/mylan-answer- e una sola chiave",
  k1.offerTopic.startsWith("mylan-offer-") && k1.answerTopic.startsWith("mylan-answer-") && k1.offerKey === k1.answerKey);

const cases = [
  ["", "#i=K7QM-4XRD-P2HW&p=2", 2], ["?i=K7QM4XRDP2HW&p=2", "", 2], ["", "#i=K7QM-4XRD-P2HW", 1],
  ["?code=K7QM4XRDP2HW", "", 1], ["", "", 2], ["?app=demo", "", 2]
];
const wrong = cases.filter(([s, h, want]) => inv.protocolOfLink(s, h) !== want);
check("protocollo scelto dal link (p=2 -> 2, link senza p -> 1, codice digitato -> 2)", wrong.length === 0,
  JSON.stringify(wrong));

console.log(results.every(Boolean) ? `OK ${results.length}/${results.length}` : "FALLITO");
process.exit(results.every(Boolean) ? 0 : 1);
