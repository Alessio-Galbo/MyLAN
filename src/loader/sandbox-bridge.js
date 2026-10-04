/**
 * Generatore dello script bridge per l'ambiente sandbox iframe di MyLAN.
 */
import { installStorageShim } from "./frame-storage-shim.js?v=76b805b937bb";

// Errori di avvio (primi 10 s): errore di script non gestito (anche SyntaxError di collegamento dei moduli), script
// che non si carica, import dinamico fallito. Uno solo a MyLAN ("mylan:app-boot-error"): src/ui/viewer-heal.js.
const BOOT_WATCH = `(function(){
  var t0 = Date.now(), sent = false;
  function report(m) { if (sent || Date.now() - t0 > 10000) return; sent = true;
    try { parent.postMessage({ type: "mylan:app-boot-error", message: String(m || "error").slice(0, 300) }, "*"); } catch (e) {} }
  addEventListener("error", function(e) {
    var tg = e.target;
    if (e instanceof ErrorEvent) report(e.message);
    else if (tg && tg.tagName === "SCRIPT") report("script " + (tg.src || ""));
  }, true);
  addEventListener("unhandledrejection", function(e) {
    var r = e.reason || {}, m = String(r.message || r);
    if (r.name === "SyntaxError" || /dynamically imported module|Importing a module script failed/.test(m)) report(m);
  });
})();`;

export function buildSandboxBridgeScript(baseSessionUrl, storagePrefix) {
  return `<base href="${baseSessionUrl}"><script>
${BOOT_WATCH}
(${installStorageShim.toString()})(${JSON.stringify(storagePrefix)});
(function(){
  const b = "${baseSessionUrl}";
  const fix = (u) => (typeof u === "string" && u.startsWith("/") && !u.startsWith("//")) ? b + u.slice(1) : u;
  const origFetch = window.fetch;
  window.fetch = (u, i) => origFetch.call(window, fix(u), i);
  const origXhr = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(m, u, ...a) { return origXhr.call(this, m, fix(u), ...a); };
  const origSetAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function(n, v) {
    return origSetAttr.call(this, n, (n === "src" || n === "href") ? fix(v) : v);
  };
  const imgDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
  if (imgDesc) Object.defineProperty(HTMLImageElement.prototype, "src", {
    set(v) { return imgDesc.set.call(this, fix(v)); }, get() { return imgDesc.get.call(this); }
  });
  const mediaDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "src");
  if (mediaDesc) Object.defineProperty(HTMLMediaElement.prototype, "src", {
    set(v) { return mediaDesc.set.call(this, fix(v)); }, get() { return mediaDesc.get.call(this); }
  });
  const linkDesc = Object.getOwnPropertyDescriptor(HTMLLinkElement.prototype, "href");
  if (linkDesc) Object.defineProperty(HTMLLinkElement.prototype, "href", {
    set(v) { return linkDesc.set.call(this, fix(v)); }, get() { return linkDesc.get.call(this); }
  });
  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener("message", (e) => {
      if (e.data && e.data.type === "mylan:whoami") window.__mylanClientId = e.data.id;
    });
    try { navigator.serviceWorker.startMessages(); navigator.serviceWorker.controller?.postMessage({ type: "mylan:whoami" }); } catch (e) {}
  }
  if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({
    scope: b, active: null, installing: null, waiting: null, addEventListener(){}, removeEventListener(){},
    unregister: () => Promise.resolve(true)
  });
  const OrigWS = window.WebSocket;
  window.WebSocket = function(u, ...a) {
    if (typeof u === "string" && (u.includes(location.host) || u.includes("github.io"))) {
      return { addEventListener(){}, removeEventListener(){}, send(){}, close(){} };
    }
    return new OrigWS(u, ...a);
  };
})();
</script>`;
}
