/**
 * Gestione reattiva del tema Chiaro / Scuro per MyLAN.
 */
let currentTheme = "dark";
const listeners = new Set();

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function initTheme() {
  const saved = localStorage.getItem("mylan_theme");
  if (saved === "light" || saved === "dark") {
    currentTheme = saved;
  } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
    currentTheme = "light";
  } else {
    currentTheme = "dark";
  }
  applyTheme(currentTheme);

  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", (e) => {
      if (!localStorage.getItem("mylan_theme")) {
        setTheme(e.matches ? "light" : "dark");
      }
    });
  }
}

export function setTheme(theme) {
  currentTheme = theme === "light" ? "light" : "dark";
  localStorage.setItem("mylan_theme", currentTheme);
  applyTheme(currentTheme);
  listeners.forEach((fn) => fn(currentTheme));
}

export function toggleTheme() {
  setTheme(currentTheme === "dark" ? "light" : "dark");
  return currentTheme;
}

export function getTheme() {
  return currentTheme;
}

export function onThemeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
