/**
 * Patch e persistenza dell'HTML root per la sandbox di sessione MyLAN.
 */
import { buildSandboxBridgeScript } from "./sandbox-bridge.js";
import { t } from "../core/i18n.js";

const SHELL_KEY = "mylan_shell_html";

export function getBaseSessionUrl() {
  const loc = window.location;
  const path = loc.pathname.replace(/\/session\/.*$/, "").replace(/\/index\.html.*$/, "").replace(/\/?$/, "/session/");
  return loc.origin + path;
}

export function hasShellHtml() {
  try {
    const val = localStorage.getItem(SHELL_KEY);
    return Boolean(val && val.length > 200 && !val.includes('meta name="mylan-fallback"'));
  } catch {
    return false;
  }
}

export function buildPatchedHtmlString(html) {
  const baseSessionUrl = getBaseSessionUrl();
  const rel = html.replace(/(href|src)=["']\/(?!\/)([^"']+)["']/gi, '$1="./$2"');
  const bridge = buildSandboxBridgeScript(baseSessionUrl);
  return rel.includes("<head>") ? rel.replace("<head>", "<head>" + bridge) : bridge + rel;
}

export function patchIndexHtml(html) {
  const patched = buildPatchedHtmlString(html);
  saveShellHtml(patched);
  return new TextEncoder().encode(patched).buffer;
}

export function saveShellHtml(patchedHtml) {
  try {
    if (patchedHtml && !patchedHtml.includes('meta name="mylan-fallback"')) {
      localStorage.setItem(SHELL_KEY, patchedHtml);
    }
  } catch {}
}

export function getShellHtml() {
  try {
    const cached = localStorage.getItem(SHELL_KEY);
    if (cached && cached.length > 200 && !cached.includes('meta name="mylan-fallback"')) {
      return cached;
    }
  } catch {}
  const title = t("portal.connecting") || "Connessione in corso";
  const desc = t("viewer.status_reconnecting") || "Riconnessione all host...";
  return `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><meta name="mylan-fallback" content="1"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#0b0f19;color:#94a3b8;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}.c{background:#131a29;border:1px solid #1e293b;border-radius:12px;padding:24px;max-width:320px}h2{color:#f1f5f9;font-size:1.1rem;margin:0 0 8px}p{font-size:.9rem;margin:0}</style></head><body><div class="c"><h2>${title}</h2><p>${desc}</p></div></body></html>`;
}
