// Cache di runtime senza tetto fisso (src/loader/sw-runtime-store.js + sw-runtime-quota.js) in una VM di Node con
// CacheStorage e quota finte: 3000 voci piccole restano tutte con quota bassa, max_entries facoltativo resta un tetto,
// oltre l'80% della quota escono le voci di runtime piu' vecchie (prima le altre app) fino al 70%, mai le regole ne' la
// cache delle pagine; parseRuntimeCache senza max_entries = nessun tetto. Uso: node Tools/test_runtime_cache.mjs
import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const root = new URL("../", import.meta.url);
function makeWorld() {
  const all = new Map(); // nome -> Map(url -> Response)
  const open = (n) => {
    if (!all.has(n)) all.set(n, new Map());
    const m = all.get(n);
    return {
      put: async (k, r) => { const u = typeof k === "string" ? k : k.url; m.delete(u); m.set(u, r); },
      match: async (k) => m.get(typeof k === "string" ? k : k.url)?.clone(),
      delete: async (k) => m.delete(typeof k === "string" ? k : k.url),
      keys: async () => [...m.keys()].map((url) => ({ url }))
    };
  };
  const est = { usage: 1e6, quota: 1e9 };
  const ctx = { caches: { open: async (n) => open(n), keys: async () => [...all.keys()] }, Response, Headers, URL,
    Blob, Date, Number, Math, Promise, navigator: { storage: { estimate: async () => est } } };
  ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext("const RUNTIME_PREFIX = 'mylan-runtime:';", ctx);
  for (const f of ["src/loader/sw-runtime-store.js", "src/loader/sw-runtime-quota.js"]) {
    vm.runInContext(fs.readFileSync(new URL(f, root), "utf8"), ctx, { filename: f });
  }
  return { all, ctx, est };
}
const url = (app, i, v = 1) => `https://p/session/${app}/api/covers/t${i}?size=256&v=${v}`;
const body = (n) => new Response(new Blob([new Uint8Array(n)]), { headers: { "content-type": "image/jpeg" } });
const rule = { prefix: "/api/covers/", version_param: "v", max_entry_kb: 1024 };
const store = (w, app, i, r = rule, v = 1, n = 100) => vm.runInContext("runtimeStore", w.ctx)(r, app, url(app, i, v), body(n));

// 1. Nessun tetto: 3000 voci con quota bassa restano tutte.
let w = makeWorld();
for (let i = 0; i < 3000; i++) await store(w, "a1", i);
assert.equal(w.all.get("mylan-runtime:a1").size, 3000);
console.log("[1] Senza max_entries 3000 voci restano tutte (quota al 0,1%)        : OK");

// 2. Una sola versione per risorsa.
await store(w, "a1", 7, rule, 2);
const t7 = [...w.all.get("mylan-runtime:a1").keys()].filter((u) => u.includes("/t7?"));
assert.deepEqual(t7, [url("a1", 7, 2)]);
console.log("[2] version_param: la versione nuova sostituisce la vecchia            : OK");

// 3. max_entries facoltativo resta un tetto.
w = makeWorld();
for (let i = 0; i < 30; i++) await store(w, "a1", i, { ...rule, max_entries: 10 });
assert.deepEqual([...w.all.get("mylan-runtime:a1").keys()], Array.from({ length: 10 }, (_, k) => url("a1", 20 + k)));
console.log("[3] max_entries=10 dato dall'app: restano le 10 piu' recenti          : OK");

// 4. Guardia sulla quota: oltre l'80% escono le voci piu' vecchie (prima l'altra app) fino al 70%.
w = makeWorld();
const rules = new Response("{}");
await (await w.ctx.caches.open("mylan-runtime:b2")).put("https://p/mylan-runtime-rules/b2", rules);
await (await w.ctx.caches.open("mylan-session-v3:a1")).put("https://p/session/a1/index.html", new Response("x"));
for (let i = 0; i < 5; i++) await store(w, "b2", i, rule, 1, 1000);
for (let i = 0; i < 10; i++) await store(w, "a1", i, rule, 1, 1000);
w.est.quota = 100000; w.est.usage = 77000; // 77%: niente
w.ctx.runtimeQuotaState.at = 0;
await store(w, "a1", 10, rule, 1, 1000);
assert.equal(w.all.get("mylan-runtime:a1").size, 11);
w.ctx.runtimeQuotaState.at = 0;
w.est.usage = 77000 + 8000; // 85%: liberare 15000 byte
await store(w, "a1", 11, rule, 1, 1000);
const b2 = [...w.all.get("mylan-runtime:b2").keys()], a1 = [...w.all.get("mylan-runtime:a1").keys()];
assert.deepEqual(b2, ["https://p/mylan-runtime-rules/b2"], "other app's entries go first, its rules stay");
assert.equal(a1.length, 12 - 10, "then the oldest of this app until 15 KB are freed");
assert.equal(a1[0], url("a1", 10));
assert.equal(w.all.get("mylan-session-v3:a1").size, 1, "app pages never touched");
console.log("[4] Quota all'85%: via 15 KB, prima l'altra app, poi le piu' vecchie   : OK");

// 5. Una verifica al minuto: subito dopo, niente nuove stime.
let calls = 0; w.ctx.runtimeEstimate = async () => { calls++; return w.est; };
await store(w, "a1", 12, rule, 1, 1000);
assert.equal(calls, 0);
console.log("[5] Al massimo una stima della quota al minuto                         : OK");

// 6. parseRuntimeCache: max_entries assente = nessun tetto, dato = tetto.
globalThis.window = { location: { origin: "https://p", pathname: "/" } };
const { parseRuntimeCache } = await import(new URL("src/loader/runtime-rules.js", root));
const [r1, r2] = parseRuntimeCache([{ prefix: "/api/covers/" }, { prefix: "/api/x/", max_entries: 9000 }]);
assert.equal(r1.max_entries, undefined);
assert.equal(r2.max_entries, 9000);
assert.equal(r1.max_entry_kb, 1024);
console.log("[6] parseRuntimeCache: max_entries facoltativo, max_entry_kb 1024      : OK");

// 7. "mylan:runtime-cache-drop": via solo i percorsi indicati e coperti da una regola, di quell'app.
w = makeWorld();
globalThis.caches = w.ctx.caches;
const { dropRuntimeEntries } = await import(new URL("src/loader/runtime-rules.js", root));
const base = "https://p/session/a1/";
const c = await w.ctx.caches.open("mylan-runtime:a1");
await c.put("https://p/mylan-runtime-rules/a1", new Response(JSON.stringify({ rules: [{ prefix: "/api/covers/" }] })));
for (const p of ["api/covers/t1?size=256&v=1", "api/covers/t1?v=1", "api/covers/t2?v=1", "api/other/t1"]) await c.put(base + p, new Response("x"));
const n = await dropRuntimeEntries("a1", ["/api/covers/t1", "/api/other/t1", 42]);
assert.equal(n, 2);
assert.deepEqual([...w.all.get("mylan-runtime:a1").keys()], ["https://p/mylan-runtime-rules/a1", base + "api/covers/t2?v=1", base + "api/other/t1"]);
assert.equal(await dropRuntimeEntries("zz", ["/api/covers/t2"]), 0);
console.log("[7] runtime-cache-drop: via le 2 misure di t1, non t2 ne' fuori regola : OK");
console.log("Tutto OK (7/7)");
