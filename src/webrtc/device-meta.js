/**
 * Rilevamento dei metadati del dispositivo client (OS, browser, tipo, schermo).
 */
export function getDeviceMeta() {
  const ua = navigator.userAgent || "";
  const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
  const os = /Android/i.test(ua) ? "Android" :
    /iPhone|iPad/i.test(ua) ? "iOS" :
    /Windows/i.test(ua) ? "Windows" :
    /Mac/i.test(ua) ? "macOS" :
    /Linux/i.test(ua) ? "Linux" : "OS";
  const browser = /Edg/i.test(ua) ? "Edge" :
    /Chrome|CriOS/i.test(ua) ? "Chrome" :
    /Firefox|FxiOS/i.test(ua) ? "Firefox" :
    /Safari/i.test(ua) ? "Safari" : "Browser";

  return {
    ua,
    os,
    browser,
    device_type: isMobile ? "Mobile" : "PC",
    screen: window.screen ? `${window.screen.width}x${window.screen.height}` : "",
    time: Date.now()
  };
}
