// WebSocket delle app sul DataChannel in Chrome headless: shim nell'iframe (src/loader/frame-ws-shim.js), tunnel nel
// visualizzatore (src/loader/ws-tunnel.js), host finto (Tools/ws_tunnel_fixture.mjs): apertura sul percorso dell'app,
// testo/binario nei due sensi, messaggi lunghi a pezzi, chiusure (app, host, canale perso 1006, stop() 1001), altri
// host al WebSocket del browser, app senza "websocket": true muta. Uso: node Tools/test_ws_tunnel.mjs [--port=] [--cdp=]
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { openExpr, startFixture } from "./ws_tunnel_fixture.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n, d) => Number((process.argv.find((a) => a.startsWith(`--${n}=`)) || "").split("=")[1]) || d;
const PORT = arg("port", 18621), CDP = arg("cdp", 9721);
const CDP_LIB = process.env.CDP_LIB || path.join(ROOT, ".claude/skills/headless-chrome-cdp/scripts/cdp.mjs");
const { launch, sleep } = await import(pathToFileURL(CDP_LIB).href);
const results = [];
const check = (name, ok, info = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : "  " + info}`); };
const killer = setTimeout(() => { console.log("TIMEOUT"); process.exit(3); }, 120000);
const srv = await startFixture(ROOT, PORT);
const browser = await launch({ port: CDP });
const W = "document.querySelector('iframe').contentWindow";
const OPEN = (url, extra) => openExpr(W, url, extra);
const log = (n) => `${W}.__log[${n}].join("|")`;
const host = "window.__host.frames";
const base = `ws://127.0.0.1:${PORT}`;
try {
  const page = await browser.openPage(`http://127.0.0.1:${PORT}/__ws/parent.html`);
  await page.waitFor(`window.__key && ${W}?.__log && 1`, 10000);
  const key = await page.eval("window.__key");
  let n = await page.eval(OPEN(`${base}/session/${key}/api/v1/ws/sync?x=1`, `try { s.send("x"); } catch (e) { l.push("throw:" + e.name); }`));
  await page.waitFor(`${log(n)}.includes("open")`, 5000).catch(() => {});
  check("send() prima dell'apertura: InvalidStateError", (await page.eval(log(n))).startsWith("throw:InvalidStateError"));
  const opened = await page.eval(`${host}.find((f) => f.type === "ws-open")`);
  check("apertura sul percorso dell'app (senza /session/<chiave>/) con il sottoprotocollo",
    opened?.path === "/api/v1/ws/sync?x=1" && opened.protocols[0] === "p1" && (await page.eval(log(n))).includes("open:p1"), JSON.stringify(opened));
  check("WebSocket.OPEN e readyState come il browser", await page.eval(`${W}.WebSocket.OPEN === 1 && ${W}.__s.readyState === 1 && ${W}.WebSocket.mylanTunnel`));
  await page.eval(`${W}.__s.send("ciao")`);
  await page.waitFor(`${log(n)}.includes("msg:")`, 5000).catch(() => {});
  check("testo andata e ritorno", (await page.eval(log(n))).includes("msg:11:echo:4:ciao"), await page.eval(log(n)));
  await page.eval(`(${W}.__s.binaryType = "arraybuffer", ${W}.__s.send(new Uint8Array([1, 2, 250])), true)`);
  await page.waitFor(`${log(n)}.includes("bin:")`, 5000).catch(() => {});
  check("binario andata e ritorno (arraybuffer)", (await page.eval(log(n))).includes("msg:bin:1,2,250"), await page.eval(log(n)));
  await page.eval(`(${W}.__s.send("y".repeat(20000)), ${W}.__s.send("big"), true)`);
  await page.waitFor(`${log(n)}.includes("msg:18001")`, 5000).catch(() => {});
  const parts = await page.eval(`${host}.filter((f) => f.type === "ws-msg" && f.text && f.text[0] === "y").map((f) => f.text.length + ":" + f.more)`);
  check("messaggio lungo dell'app in pezzi (more), ricomposto dall'host", parts.join(",") === "8000:true,8000:true,4000:false"
    && (await page.eval(log(n))).includes("msg:31:echo:20000:"), parts.join(","));
  check("messaggio lungo dell'host ricomposto per l'app", (await page.eval(log(n))).includes("msg:18001:["));
  await page.eval(`(${W}.__s.close(4000, "fine"), true)`);
  await page.waitFor(`${log(n)}.includes("close")`, 5000).catch(() => {});
  const closeFrame = await page.eval(`${host}.filter((f) => f.type === "ws-close").pop()`);
  check("close() dell'app: ws-close all'host e chiusura pulita", closeFrame?.code === 4000 && (await page.eval(log(n))).endsWith("close:4000:true"), JSON.stringify(closeFrame));
  n = await page.eval(OPEN(`${base}/api/v1/altro`));
  await page.waitFor(`${log(n)}.includes("close")`, 5000).catch(() => {});
  check("percorso rifiutato dall'host: chiusura 1008 senza apertura", (await page.eval(log(n))) === "close:1008:true", await page.eval(log(n)));
  n = await page.eval(OPEN(`${base}/api/v1/ws/sync`));
  await page.waitFor(`${log(n)}.includes("open")`, 5000);
  await page.eval(`(${W}.__s.send("close"), true)`);
  await page.waitFor(`${log(n)}.includes("close")`, 5000).catch(() => {});
  check("chiusura dall'host (4001)", (await page.eval(log(n))).endsWith("close:4001:true"), await page.eval(log(n)));
  n = await page.eval(OPEN(`${base}/api/v1/ws/sync`));
  await page.waitFor(`${log(n)}.includes("open")`, 5000);
  await page.eval("(window.__host.lose(), true)");
  await page.waitFor(`${log(n)}.includes("close")`, 5000).catch(() => {});
  check("canale perso: error + chiusura 1006", (await page.eval(log(n))).endsWith("error|close:1006:false"), await page.eval(log(n)));
  n = await page.eval(OPEN(`${base}/api/v1/ws/sync`));
  await page.waitFor(`${log(n)}.includes("close")`, 5000).catch(() => {});
  check("senza canale: chiusura 1006 subito (l'app riprova)", (await page.eval(log(n))).endsWith("close:1006:false"), await page.eval(log(n)));
  await page.eval("(window.__connect(), true)");
  n = await page.eval(OPEN(`${base}/api/v1/ws/sync`));
  await page.waitFor(`${log(n)}.includes("open")`, 5000).catch(() => {});
  check("canale di nuovo aperto: la nuova connessione si apre", (await page.eval(log(n))).includes("open"), await page.eval(log(n)));
  await page.eval("(window.__tunnel.stop(), true)");
  await page.waitFor(`${log(n)}.includes("close")`, 5000).catch(() => {});
  check("visualizzatore chiuso: 1001 all'app e ws-close all'host", (await page.eval(log(n))).endsWith("close:1001:true")
    && (await page.eval(`${host}.some((f) => f.type === "ws-close" && f.code === 1001)`)), await page.eval(log(n)));
  check("altro host: WebSocket del browser", await page.eval(`(() => { const C = ${W}.WebSocket; return !("_port" in new C("ws://localhost:9/x")); })()`));
  const muted = await browser.openPage(`http://127.0.0.1:${PORT}/__ws/parent.html?optin=0`);
  await muted.waitFor(`window.__key && ${W}?.__log && 1`, 10000);
  n = await muted.eval(OPEN(`${base}/api/v1/ws/sync`));
  await sleep(800);
  check("app senza \"websocket\": true: socket muto come prima, nulla sul canale",
    (await muted.eval(log(n))) === "" && (await muted.eval(`${host}.length`)) === 0, await muted.eval(log(n)));
  const errs = [...page.drainErrors(), ...muted.drainErrors()].filter((e) => !/localhost:9|favicon/.test(e));
  check("nessun errore in console", errs.length === 0, errs.join(" | "));
} catch (e) { console.error("ERROR", e.stack || e); results.push(false); }
finally { await browser.close(); await srv.closeAll(); clearTimeout(killer); }
const ok = !results.includes(false);
console.log(`${ok ? "OK" : "FALLITO"} ${results.filter(Boolean).length}/${results.length}`);
process.exit(ok ? 0 : 1);
