/**
 * Formattatore e validatore del campo di inserimento codice monouso.
 */
import { t } from "../core/i18n.js?v=76b805b937bb";

export function formatCode(raw) {
  const clean = (raw || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const capped = clean.slice(0, 12);
  if (capped.length > 8) {
    return `${capped.slice(0, 4)}-${capped.slice(4, 8)}-${capped.slice(8)}`;
  }
  if (capped.length > 4) {
    return `${capped.slice(0, 4)}-${capped.slice(4)}`;
  }
  return capped;
}

export function extractCodeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const codeParam = params.get("i") || params.get("code");
  if (codeParam) return formatCode(codeParam);
  const hashMatch = (window.location.hash || "").match(/[#&](?:i|code)=([^&]+)/);
  if (hashMatch) return formatCode(decodeURIComponent(hashMatch[1]));
  return "";
}

export function clearUrlParams() {
  if (window.location.search || window.location.hash) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

export function createCodeInput(initialValue = "") {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "code-input";
  input.placeholder = t("portal.code_placeholder");
  input.autocomplete = "off";
  input.spellcheck = false;
  input.value = formatCode(initialValue);

  input.addEventListener("input", () => {
    const cur = input.value;
    input.value = formatCode(cur);
  });

  return input;
}
