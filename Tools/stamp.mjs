// Timbro di versione di MyLAN, da lanciare prima di ogni pubblicazione: `node Tools/stamp.mjs`.
// Mette "?v=<versione>" su tutti gli import, gli importScripts di sw.js, il fetch dei testi e i link di index.html, e
// scrive version.json: il browser non mescola mai moduli di due pubblicazioni (GitHub Pages li tiene in cache 10 min).
// La versione e' un hash del contenuto: nessun numero da aumentare a mano. `--check` non scrive niente ed esce con 1
// se un timbro manca, e' diverso dalla versione attuale o punta a un file che non esiste.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyStamp, referencesOf, shippedFiles, computeVersions, VERSION_RE } from "./stamp-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = process.argv.includes("--check");
const { version, swVersion } = computeVersions(ROOT);
const problems = [];
let changed = 0;

for (const rel of shippedFiles(ROOT).filter((f) => /\.(js|html)$/.test(f))) {
  const file = path.join(ROOT, rel);
  const text = fs.readFileSync(file, "utf8");
  for (const ref of referencesOf(rel, text)) {
    if (!fs.existsSync(path.join(ROOT, ref))) problems.push(`${rel}: riferimento a un file che non esiste: ${ref}`);
  }
  const stamped = applyStamp(rel, text, version, swVersion);
  if (stamped === text) continue;
  changed++;
  if (CHECK) problems.push(`${rel}: timbri non aggiornati (atteso ?v=${rel === "sw.js" ? swVersion : version})`);
  else fs.writeFileSync(file, stamped);
}

const versionFile = path.join(ROOT, "version.json");
const versionJson = JSON.stringify({ version, sw: swVersion }, null, 2) + "\n";
let current = "";
try { current = fs.readFileSync(versionFile, "utf8").replace(/\r\n/g, "\n"); } catch {}
if (current !== versionJson) {
  if (CHECK) problems.push(`version.json: non dice ${version}`);
  else { fs.writeFileSync(versionFile, versionJson); changed++; }
}
if (!VERSION_RE.test(version)) problems.push(`versione non valida: ${version}`);

if (problems.length) {
  console.log(problems.join("\n"));
  console.log(CHECK ? "\nFAIL: lancia `node Tools/stamp.mjs` prima di pubblicare." : "\nFAIL");
  process.exit(1);
}
console.log(`${CHECK ? "OK" : "Timbrato"}: versione ${version}, Service Worker ${swVersion}` +
  (CHECK ? "" : `, ${changed} file aggiornati`));
