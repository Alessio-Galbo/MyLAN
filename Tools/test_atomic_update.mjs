// Aggiornamento atomico di MyLAN nel browser (Chrome headless) su un server "come GitHub Pages" (max-age=600, ETag).
// A) senza Service Worker: index.html vecchio in cache e un modulo gia' scaduto dopo una nuova pubblicazione ->
//    deve partire la nuova versione intera (src/boot.js legge version.json).
// B) con il Service Worker (src/loader/sw-shell.js): il lancio dopo la pubblicazione parte SUBITO dalla cache con la
//    versione vecchia intera, scarica la nuova in background (tutto o niente); quello dopo parte con la nuova senza
//    chiedere file alla rete; un modulo mancante in cache con il server gia' su un'altra versione -> 503, e boot.js
//    riparte con la versione pubblicata. Mai moduli mescolati.
// `--no-stamp`: solo A con MyLAN senza timbri, deve riprodurre il guasto. Uso: node Tools/test_atomic_update.mjs
// [--no-stamp] [--port=18531] [--cdp=9631]
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { makeDeploy, startPagesServer } from "./atomic_update_fixture.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n, d) => Number((process.argv.find((a) => a.startsWith(`--${n}=`)) || "").split("=")[1]) || d;
const PORT = arg("port", 18531), CDP = arg("cdp", 9631), STAMP = !process.argv.includes("--no-stamp");
const CDP_LIB = process.env.CDP_LIB || path.join(ROOT, ".claude/skills/headless-chrome-cdp/scripts/cdp.mjs");
const { launch, sleep } = await import(pathToFileURL(CDP_LIB).href);
const BASE = `http://127.0.0.1:${PORT}/`;
const results = [];
const check = (name, ok, info = "") => {
  results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? "  " + info : ""}`);
};
const killer = setTimeout(() => { console.log("TIMEOUT"); process.exit(3); }, 180000);
const marks = ["old", "new", "newer"];
const D = Object.fromEntries(marks.map((m) => [m, makeDeploy(ROOT, m, STAMP)]));
const { srv, state } = await startPagesServer(PORT, ["/src/core/theme.js"]);
const browser = await launch({ port: CDP });
const mark = "window.__mylanDeploy || ''";
const srcLoaded = `performance.getEntriesByType("resource").map((e) => e.name).filter((n) => /\\/src\\/.*\\.js/.test(n))`;

async function open(page, deploy) {
  if (deploy) state.dir = D[deploy].dir;
  state.log.length = 0; page.drainErrors();
  await page.navigate("about:blank");
  await page.send("Page.navigate", { url: BASE });
  await sleep(300);
  await page.waitFor(`document.readyState === 'complete' && (${mark} !== '' || ${page.errors.length} > 0)`, 10000).catch(() => {});
  await sleep(800);
  const got = await page.eval(mark).catch(() => "");
  const errors = page.drainErrors();
  const mixed = errors.some((e) => /does not provide an export|SyntaxError/.test(e));
  const wrong = (await page.eval(srcLoaded).catch(() => [])).map((u) => new URL(u))
    .filter((u) => u.pathname !== "/src/boot.js" && got && u.searchParams.get("v") !== D[got]?.version);
  return { got, errors, mixed, wrong, log: [...state.log] };
}

try {
  // A) Senza Service Worker
  const a = await browser.openPage("about:blank");
  await a.send("Network.setBypassServiceWorker", { bypass: true });
  let r = await open(a, "old");
  check("A: vecchia pubblicazione avviata", r.got === "old", `versione ${D.old.version || "-"}`);
  r = await open(a, "new");
  check("A: condizione: index.html vecchio dalla cache, modulo scaduto dal server",
    !r.log.some((p) => p === "/" || p.startsWith("/index.html")) && r.log.some((p) => p.startsWith("/src/core/theme.js")));
  if (!STAMP) {
    check("A: senza timbri il guasto si riproduce", r.mixed || r.got !== "new", `segno="${r.got}" ${r.errors[0] || ""}`);
  } else {
    check("A: parte la nuova pubblicazione intera", r.got === "new" && !r.mixed && !r.wrong.length,
      `segno="${r.got}" ${r.errors.join(" | ").slice(0, 200)}`);
    await a.close();
    // B) Con il Service Worker: profilo gia' visitato (registrazione, poi pagina e file in cache)
    const b = await browser.openPage("about:blank");
    await open(b, "old");
    await b.waitFor("navigator.serviceWorker.controller !== null", 10000).catch(() => {});
    r = await open(b, "old");
    await sleep(1500);
    const shell = await b.eval(`caches.open("mylan-shell-v1").then((c) => c.keys()).then((k) => k.length)`);
    check("B: Service Worker e copia dei file di MyLAN", r.got === "old" && shell > 30, `${shell} file in cache`);
    r = await open(b, "new");
    check("B: subito dalla cache la versione vecchia intera (niente attese di rete)", r.got === "old" && !r.mixed &&
      !r.wrong.length && !r.log.some((p) => p.includes("/src/") && p.includes(D.old.version)), `segno="${r.got}"`);
    await sleep(2500); // scaricamento della nuova in background
    r = await open(b);
    const srcAsked = r.log.filter((p) => p.startsWith("/src/"));
    check("B: al lancio dopo la nuova, gia' tutta in cache", r.got === "new" && !r.mixed && !r.wrong.length &&
      srcAsked.length === 0, `segno="${r.got}", file chiesti alla rete: ${srcAsked.length}`);
    await b.eval(`caches.open("mylan-shell-v1").then((c) => c.delete(new URL("src/core/theme.js?v=${D.new.version}", location.href).href))`);
    r = await open(b, "newer");
    const refused = r.log.some((p) => p.startsWith("/version.json"));
    // Il grafo rifiutato (v=new) compare fra le risorse scaricate ma non e' mai stato eseguito.
    const wrong = r.wrong.filter((u) => u.searchParams.get("v") !== D.new.version);
    check("B: file mancante e server gia' oltre: rifiutato, parte la versione pubblicata intera", r.got === "newer" &&
      !r.mixed && !wrong.length && refused, `segno="${r.got}"`);
  }
} catch (e) {
  check("eccezione", false, e.message);
} finally {
  await browser.close();
  await srv.closeAll();
  for (const d of Object.values(D)) fs.rmSync(d.dir, { recursive: true, force: true });
  clearTimeout(killer);
}
const failed = results.filter((ok) => !ok).length;
console.log(failed ? `\n${failed} FAIL su ${results.length}` : `\nOK ${results.length}/${results.length}`);
process.exit(failed ? 1 : 0);
