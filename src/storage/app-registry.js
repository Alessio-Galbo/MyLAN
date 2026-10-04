/**
 * Registro locale per la memorizzazione e gestione delle web app collegate.
 */
const STORAGE_KEY = "mylan_apps";

export function getSavedApps() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveApp(app) {
  if (!app || !app.id) return;
  const existing = getSavedApps().find((item) => item.id === app.id);
  const list = getSavedApps().filter((item) => item.id !== app.id);
  list.unshift({
    id: app.id,
    title: app.title || app.name || existing?.title || "Web Application",
    description: app.description || existing?.description || "",
    icon: app.icon || existing?.icon || "",
    themeColor: app.themeColor || existing?.themeColor || "",
    code: app.code || existing?.code || "",
    reconnectToken: app.reconnectToken || existing?.reconnectToken || "",
    mediaPaths: Array.isArray(app.mediaPaths) ? app.mediaPaths : (existing?.mediaPaths || []),
    chunkedUploads: typeof app.chunkedUploads === "boolean" ? app.chunkedUploads : Boolean(existing?.chunkedUploads),
    lastUsed: Date.now(),
    autoLaunch: Boolean(app.autoLaunch)
  });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Gestione quota storage
  }
}

export function removeApp(id) {
  const list = getSavedApps().filter((item) => item.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function touchApp(id) {
  const list = getSavedApps();
  const target = list.find((item) => item.id === id);
  if (target) {
    target.lastUsed = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }
}

export function getApp(id) {
  return getSavedApps().find((item) => item.id === id) || null;
}

export function findAppByQuery(query) {
  if (!query) return null;
  const q = query.toLowerCase();
  return getSavedApps().find((a) => {
    const slug = (a.title || a.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return slug === q || a.id.toLowerCase() === q || (a.code && a.code.toLowerCase() === q);
  }) || null;
}
