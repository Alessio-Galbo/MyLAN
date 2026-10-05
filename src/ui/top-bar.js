/**
 * Barra degli strumenti superiore: logo, lingua, tema e supporto Ko-fi.
 */
import { t, getLang, setLang, onLangChange } from "../core/i18n.js?v=1669042733e9";
import { getTheme, toggleTheme, onThemeChange } from "../core/theme.js?v=1669042733e9";
import { createKofiButton } from "./kofi-btn.js?v=1669042733e9";
import { ICON_SUN, ICON_MOON } from "./icons.js?v=1669042733e9";

export function renderTopBar(container) {
  const bar = document.createElement("header");
  bar.className = "top-bar";

  const brand = document.createElement("div");
  brand.className = "top-brand";
  brand.innerHTML = '<span class="top-logo-dot"></span><span class="top-brand-text">My<span class="top-brand-accent">LAN</span></span>';

  const actions = document.createElement("div");
  actions.className = "top-actions";

  const kofi = createKofiButton();

  const langBtn = document.createElement("button");
  langBtn.type = "button";
  langBtn.className = "util-btn lang-btn";
  langBtn.textContent = getLang() === "it" ? "EN" : "IT";
  langBtn.title = t("nav.lang_title");
  langBtn.setAttribute("aria-label", t("nav.lang_title"));
  langBtn.addEventListener("click", () => {
    setLang(getLang() === "it" ? "en" : "it");
  });

  const themeBtn = document.createElement("button");
  themeBtn.type = "button";
  themeBtn.className = "util-btn theme-btn";
  const updateThemeIcon = (theme) => {
    themeBtn.innerHTML = theme === "dark" ? ICON_SUN : ICON_MOON;
    themeBtn.title = theme === "dark" ? t("nav.theme_light") : t("nav.theme_dark");
  };
  updateThemeIcon(getTheme());
  themeBtn.addEventListener("click", () => {
    const next = toggleTheme();
    updateThemeIcon(next);
  });

  onLangChange(() => {
    langBtn.textContent = getLang() === "it" ? "EN" : "IT";
    langBtn.title = t("nav.lang_title");
    kofi.updateText();
    updateThemeIcon(getTheme());
  });

  onThemeChange((theme) => {
    updateThemeIcon(theme);
  });

  actions.append(kofi.el, langBtn, themeBtn);
  bar.append(brand, actions);
  container.append(bar);
}
