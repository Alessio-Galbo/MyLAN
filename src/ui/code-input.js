/**
 * Formattatore e validatore del campo di inserimento codice monouso.
 */
import { t } from "../core/i18n.js?v=47145387c383";
import { protocolOfLink } from "../crypto/invite-v2.js?v=47145387c383";

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

/** Protocollo d'invito del link aperto (src/crypto/invite-v2.js): 1 solo per i link senza "p" degli host meno recenti. */
export function inviteProtocolFromUrl() {
  return protocolOfLink(window.location.search, window.location.hash);
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
