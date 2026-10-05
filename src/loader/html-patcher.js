/**
 * Patch e persistenza dell'HTML root per la sandbox di sessione MyLAN.
 */
import { buildSandboxBridgeScript } from "./sandbox-bridge.js?v=47145387c383";
import { sessionBaseUrl, storagePrefix } from "./session-key.js?v=47145387c383";
import { t } from "../core/i18n.js?v=47145387c383";

// Una copia della pagina iniziale per app (chiave di sessione), mai condivisa fra app diverse.
export const SHELL_KEY_PREFIX = "mylan_shell_html:";

function readShell(appKey) {
  try {
    const val = localStorage.getItem(SHELL_KEY_PREFIX + appKey);
    if (val && val.length > 200 && !val.includes('meta name="mylan-fallback"')) return val;
  } catch {}
  return "";
}

export function hasShellHtml(appKey) {
  return Boolean(readShell(appKey));
}

export function buildPatchedHtmlString(html, appKey) {
  const baseSessionUrl = sessionBaseUrl(appKey);
  const rel = html.replace(/(href|src)=["']\/(?!\/)([^"']+)["']/gi, '$1="./$2"');
  const bridge = buildSandboxBridgeScript(baseSessionUrl, storagePrefix(appKey));
  return rel.includes("<head>") ? rel.replace("<head>", () => "<head>" + bridge) : bridge + rel;
}

export function patchIndexHtml(html, appKey) {
  const patched = buildPatchedHtmlString(html, appKey);
  saveShellHtml(patched, appKey);
  return new TextEncoder().encode(patched).buffer;
}

export function saveShellHtml(patchedHtml, appKey) {
  try {
    if (patchedHtml && !patchedHtml.includes('meta name="mylan-fallback"')) {
      localStorage.setItem(SHELL_KEY_PREFIX + appKey, patchedHtml);
    }
  } catch {}
}

export function getShellHtml(appKey) {
  const cached = readShell(appKey);
  if (cached) return cached;
  const title = t("portal.connecting") || "Connessione in corso";
  const desc = t("viewer.status_reconnecting") || "Riconnessione all host...";
  return `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><meta name="mylan-fallback" content="1"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#0b0f19;color:#94a3b8;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}.c{background:#131a29;border:1px solid #1e293b;border-radius:12px;padding:24px;max-width:320px}h2{color:#f1f5f9;font-size:1.1rem;margin:0 0 8px}p{font-size:.9rem;margin:0}</style></head><body><div class="c"><h2>${title}</h2><p>${desc}</p></div></body></html>`;
}
