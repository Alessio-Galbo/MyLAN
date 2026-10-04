// Due pubblicazioni finte di MyLAN e un server "come GitHub Pages" per Tools/test_atomic_update.mjs.
// La vecchia esporta DEPLOY_OLD da src/core/theme.js, la nuova DEPLOY_NEW: se il browser mescola i moduli delle due,
// src/app.js muore con "does not provide an export named ...".
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { applyStamp } from "./stamp-rules.mjs";

const SHIPPED = ["index.html", "sw.js", "manifest.json", "favicon.svg", "src", "Tools/stamp.mjs", "Tools/stamp-rules.mjs"];
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };

function walkJs(dir, rel = "") {
  return fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walkJs(dir, rel + e.name + "/") : /\.(js|html)$/.test(e.name) ? [rel + e.name] : []);
}

/** Copia di MyLAN con il segno `mark`; stamp=false riproduce MyLAN senza timbri (index.html carica src/app.js). */
export function makeDeploy(root, mark, stamp = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mylan-${mark}-`));
  for (const f of SHIPPED) fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
  for (const f of SHIPPED) fs.cpSync(path.join(root, f), path.join(dir, f), { recursive: true });
  const name = "DEPLOY_" + mark.toUpperCase();
  fs.appendFileSync(path.join(dir, "src/core/theme.js"), `\nexport const ${name} = "${mark}";\n`);
  fs.appendFileSync(path.join(dir, "src/loader/sw-pipe.js"), `\n// pubblicazione ${mark}\n`);
  const app = path.join(dir, "src/app.js");
  fs.writeFileSync(app, fs.readFileSync(app, "utf8").replace(/^(import [^\n]+\n)/m,
    `$1import { ${name} } from "./core/theme.js";\nwindow.__mylanDeploy = ${name};\n`));
  if (stamp) {
    execFileSync(process.execPath, [path.join(dir, "Tools/stamp.mjs")], { stdio: "ignore" });
  } else {
    for (const rel of walkJs(dir)) {
      const f = path.join(dir, rel);
      fs.writeFileSync(f, applyStamp(rel, fs.readFileSync(f, "utf8"), "", ""));
    }
    const idx = path.join(dir, "index.html");
    fs.writeFileSync(idx, fs.readFileSync(idx, "utf8").replace("./src/boot.js", "./src/app.js"));
  }
  let stamps = {};
  try { stamps = JSON.parse(fs.readFileSync(path.join(dir, "version.json"), "utf8")); } catch {}
  return { dir, version: stamps.version || "", sw: stamps.sw || "" };
}

/**
 * Come GitHub Pages: la query non conta, Cache-Control max-age=600 ed ETag con 304. I percorsi in `shortLived`
 * rispondono "no-cache" (un modulo scaduto prima degli altri, o arrivato dopo nella cache del browser).
 */
export function startPagesServer(port, shortLived = []) {
  const state = { dir: "", log: [] };
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    state.log.push(u.pathname + u.search);
    let file = path.join(state.dir, decodeURIComponent(u.pathname));
    if (u.pathname.endsWith("/")) file = path.join(file, "index.html");
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory() || u.pathname.includes("/session/")) {
      res.writeHead(404, { "content-type": "text/plain" }); res.end("not found"); return;
    }
    const body = fs.readFileSync(file);
    const etag = '"' + crypto.createHash("sha1").update(body).digest("hex") + '"';
    const cache = shortLived.includes(u.pathname) ? "no-cache" : "max-age=600";
    const headers = { "content-type": MIME[path.extname(file)] || "application/octet-stream", "cache-control": cache, etag };
    if (req.headers["if-none-match"] === etag) { res.writeHead(304, headers); res.end(); return; }
    res.writeHead(200, headers); res.end(body);
  });
  srv.closeAll = () => new Promise((r) => { srv.closeAllConnections(); srv.close(r); });
  return new Promise((r) => srv.listen(port, "127.0.0.1", () => r({ srv, state })));
}
