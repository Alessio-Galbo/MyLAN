// Aggiornamento atomico di MyLAN nel browser (Chrome headless): pubblicazione vecchia in cache, poi una nuova sullo
// stesso indirizzo con index.html vecchio ancora in cache (max-age=600 come GitHub Pages) e un modulo gia' scaduto.
// Deve partire una sola versione, la nuova, senza errori. `--no-stamp` rifa' la prova con MyLAN senza timbri e deve
// riprodurre il guasto (moduli mescolati). Uso: node Tools/test_atomic_update.mjs [--no-stamp] [--port=N] [--cdp=N]
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
const killer = setTimeout(() => { console.log("TIMEOUT"); process.exit(3); }, 120000);

const oldD = makeDeploy(ROOT, "old", STAMP), newD = makeDeploy(ROOT, "new", STAMP);
const { srv, state } = await startPagesServer(PORT, ["/src/core/theme.js"]);
const browser = await launch({ port: CDP });
const loaded = `performance.getEntriesByType("resource").map((e) => e.name).filter((n) => n.includes("/src/"))`;
const mark = "window.__mylanDeploy || ''";
try {
  const page = globalThis.__page = await browser.openPage("about:blank");
  state.dir = oldD.dir;
  await page.navigate(BASE, "document.querySelector('#app-root')?.children.length > 0");
  check("vecchia pubblicazione avviata", (await page.eval(mark)) === "old", `versione ${oldD.version || "-"}`);
  page.drainErrors();

  state.dir = newD.dir; state.log.length = 0;
  await page.navigate("about:blank");
  await page.send("Page.navigate", { url: BASE });
  await sleep(300);
  await page.waitFor(`document.readyState === 'complete' && (${mark} !== '' || ${page.errors.length} > 0)`, 8000)
    .catch(() => {});
  await sleep(1500);
  const got = await page.eval(mark), errors = page.drainErrors(), log = [...state.log];
  check("condizione: index.html vecchio preso dalla cache", !log.some((p) => p === "/" || p.startsWith("/index.html")),
    `richieste: ${log.length}`);
  check("condizione: il modulo scaduto torna dal server", log.some((p) => p.startsWith("/src/core/theme.js")));
  const mixed = errors.some((e) => /does not provide an export|SyntaxError/.test(e));
  if (!STAMP) {
    check("senza timbri il guasto si riproduce (moduli mescolati)", mixed || got !== "new", `segno="${got}" ${errors[0] || ""}`);
  } else {
    check("parte la nuova pubblicazione", got === "new", `segno="${got}"`);
    check("nessun errore di moduli mescolati", !mixed && errors.length === 0, errors.join(" | ").slice(0, 300));
    const urls = (await page.eval(loaded)).map((u) => new URL(u)).filter((u) => /\.(js|json)$/.test(u.pathname));
    const fresh = urls.filter((u) => u.pathname !== "/src/boot.js");
    const wrong = fresh.filter((u) => u.searchParams.get("v") !== newD.version);
    check("tutti i moduli caricati portano ?v=<nuova versione>", fresh.length > 30 && wrong.length === 0,
      `${fresh.length} file, versione ${newD.version}${wrong.length ? ", diversi: " + wrong.slice(0, 3).join(" ") : ""}`);
    const css = await page.eval(`[...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href)`);
    const oldCss = css.filter((h) => new URL(h).searchParams.get("v") !== newD.version);
    check("fogli di stile della nuova versione", css.length > 5 && oldCss.length === 0, `${css.length} fogli`);
    check("version.json letto senza cache", log.includes("/version.json"));
    check("pagina disegnata", await page.eval("document.querySelector('#app-root').children.length > 0"));
    const sw = await page.eval("navigator.serviceWorker.getRegistration().then((r) => r?.active?.scriptURL || '')");
    const swNew = `/src/loader/sw-pipe.js?v=${newD.sw}`;
    for (let i = 0; i < 40 && !state.log.includes(swNew); i++) await sleep(150);
    check("Service Worker della nuova versione con i suoi importScripts", sw.endsWith("/sw.js") &&
      state.log.includes(swNew) && newD.sw !== oldD.sw, `${sw} ${swNew}`);
  }
} catch (e) {
  check("eccezione", false, e.message + " " + (globalThis.__page?.errors || []).join(" | ").slice(0, 400));
} finally {
  await browser.close();
  await srv.closeAll();
  for (const d of [oldD.dir, newD.dir]) fs.rmSync(d, { recursive: true, force: true });
  clearTimeout(killer);
}
const failed = results.filter((ok) => !ok).length;
console.log(failed ? `\n${failed} FAIL su ${results.length}` : `\nOK ${results.length}/${results.length}`);
process.exit(failed ? 1 : 0);
