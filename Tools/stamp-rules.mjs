// Regole del timbro di versione (Tools/stamp.mjs): dove va "?v=<versione>" e come si calcola la versione.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const VERSION_RE = /^[0-9a-f]{12}$/;
// File pubblicati che il browser carica: solo questi entrano nella versione (docs, Tools, CHANGELOG no).
const SHIPPED_TOP = ["index.html", "sw.js", "manifest.json", "favicon.svg"];

// import ... from "./x.js", import "./x.js", import("./x.js"), export ... from "./x.js"
const JS_IMPORT = /(\bfrom\s*|\bimport\s*\(\s*|^\s*import\s*)(["'])(\.{1,2}\/[^"'?\n]+\.js)(?:\?v=[^"'\n]*)?\2/gm;
// Stringhe "./src/...{js,json,css}": importScripts di sw.js, fetch dei testi (src/core/i18n.js).
const SRC_STRING = /(["'`])(\.\/src\/[^"'`?\n]+\.(?:js|json|css))(?:\?v=[^"'`\n]*)?\1/g;
// index.html: <script src> e <link href> verso .js/.css locali.
const HTML_REF = /(\s(?:src|href)=")(\.\/[^"?]+\.(?:js|css))(?:\?v=[^"]*)?"/g;
// src/boot.js: versione di riserva quando version.json non si legge (offline).
const BOOT_CONST = /(\bMYLAN_VERSION\s*=\s*")[^"]*(")/;

const tag = (v) => (v ? `?v=${v}` : "");

/** Applica il timbro `version` (vuoto = forma canonica, usata per l'hash) a un file. */
export function applyStamp(rel, text, version, swVersion) {
  if (rel.endsWith(".html")) return text.replace(HTML_REF, (m, a, p) => `${a}${p}${tag(version)}"`);
  if (!rel.endsWith(".js")) return text;
  const v = rel === "sw.js" ? swVersion : version;
  let out = text.replace(JS_IMPORT, (m, a, q, p) => `${a}${q}${p}${tag(v)}${q}`)
    .replace(SRC_STRING, (m, q, p) => `${q}${p}${tag(v)}${q}`);
  if (rel === "src/boot.js") out = out.replace(BOOT_CONST, (m, a, b) => `${a}${version}${b}`);
  return out;
}

/** Riferimenti locali timbrabili di un file (per controllare che esistano). */
export function referencesOf(rel, text) {
  const refs = [];
  const from = path.posix.dirname(rel);
  if (rel.endsWith(".html")) for (const m of text.matchAll(HTML_REF)) refs.push(path.posix.join(from, m[2]));
  if (rel.endsWith(".js")) {
    for (const m of text.matchAll(JS_IMPORT)) refs.push(path.posix.join(from, m[3]));
    for (const m of text.matchAll(SRC_STRING)) if (!m[2].includes("${")) refs.push(path.posix.normalize(m[2]));
  }
  return refs;
}

function walk(root, dir, out) {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = dir + "/" + e.name;
    if (e.isDirectory()) walk(root, rel, out); else out.push(rel);
  }
  return out;
}

export function shippedFiles(root) {
  return [...SHIPPED_TOP.filter((f) => fs.existsSync(path.join(root, f))), ...walk(root, "src", [])].sort();
}

/** File caricati da sw.js con importScripts: il Service Worker ha una versione sua (si reinstalla solo se cambiano). */
export function swFiles(root) {
  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  const call = sw.match(/importScripts\(([\s\S]*?)\);/);
  const list = call ? [...call[1].matchAll(SRC_STRING)].map((m) => m[2].slice(2)) : [];
  return ["sw.js", ...list].sort();
}

function hashOf(root, files) {
  const h = crypto.createHash("sha256");
  for (const rel of files) {
    const raw = fs.readFileSync(path.join(root, rel));
    const isText = /\.(js|html|css|json|svg)$/.test(rel);
    const body = isText ? applyStamp(rel, raw.toString("utf8").replace(/\r\n/g, "\n"), "", "") : raw;
    h.update(rel + "\0").update(body).update("\0");
  }
  return h.digest("hex").slice(0, 12);
}

/** Versione della pagina (tutti i file pubblicati) e del Service Worker (sw.js + importScripts). */
export function computeVersions(root) {
  return { version: hashOf(root, shippedFiles(root)), swVersion: hashOf(root, swFiles(root)) };
}
