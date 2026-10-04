/**
 * Gestione slug URL e favicon per il visualizzatore MyLAN.
 */
export function getAppSlug(app) {
  const name = app?.title || app?.name || app?.id || "app";
  return encodeURIComponent(name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
}

export function setFavicon(el, icon) {
  if (!icon) return el;
  const raw = icon.trim();
  const isSvg = raw.startsWith("<svg") || raw.includes("image/svg+xml");
  const href = raw.startsWith("<svg") ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(raw) : raw;
  const target = el || document.querySelector("link[rel*='icon']");
  const newLink = document.createElement("link");
  newLink.rel = "icon";
  newLink.type = isSvg ? "image/svg+xml" : "image/png";
  newLink.href = href;
  if (target && target.parentNode) {
    target.parentNode.replaceChild(newLink, target);
  } else {
    document.head.appendChild(newLink);
  }
  return newLink;
}

export function restoreFavicon(el, prevFavicon, prevType) {
  const target = el || document.querySelector("link[rel*='icon']");
  const newLink = document.createElement("link");
  newLink.rel = "icon";
  if (prevType) newLink.type = prevType;
  newLink.href = prevFavicon || "./favicon.svg";
  if (target && target.parentNode) {
    target.parentNode.replaceChild(newLink, target);
  } else {
    document.head.appendChild(newLink);
  }
  return newLink;
}

/** Icona dichiarata dalla pagina dell'app (se MyLAN non ne ha una migliore): favicon e installazione aggiornate. */
export function adoptFrameIcon(iframe, appData, faviconEl, onChange) {
  try {
    const link = iframe.contentDocument?.querySelector?.("link[rel*='icon']");
    if (link?.href && (!appData.icon || appData.icon.startsWith("<svg")) && !link.href.includes("/session/")) {
      appData.icon = link.href;
      setFavicon(faviconEl, appData.icon);
      onChange();
    }
  } catch {}
}
