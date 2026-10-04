/**
 * Sistema di internazionalizzazione leggero e reattivo per MyLAN.
 */
let currentDict = {};
let currentLang = "it";
const listeners = new Set();

async function loadDict(lang) {
  try {
    const res = await fetch(`./src/locales/${lang}.json?v=76b805b937bb`);
    currentDict = await res.json();
  } catch {
    currentDict = {};
  }
}

export async function initI18n() {
  const saved = localStorage.getItem("mylan_lang");
  if (saved && (saved === "it" || saved === "en")) {
    currentLang = saved;
  } else {
    const browserLang = (navigator.language || "it").toLowerCase();
    currentLang = browserLang.startsWith("it") ? "it" : "en";
  }
  await loadDict(currentLang);
}

export async function setLang(lang) {
  if (lang !== "it" && lang !== "en") return;
  currentLang = lang;
  localStorage.setItem("mylan_lang", lang);
  await loadDict(lang);
  listeners.forEach((fn) => fn(currentLang));
}

export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function t(path, fallback = "") {
  if (!path) return fallback;
  const parts = path.split(".");
  let cur = currentDict;
  for (const part of parts) {
    if (cur && typeof cur === "object" && part in cur) {
      cur = cur[part];
    } else {
      return fallback || path;
    }
  }
  return typeof cur === "string" ? cur : (fallback || path);
}

export function getLang() {
  return currentLang;
}
