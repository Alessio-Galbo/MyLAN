/**
 * Ritorno automatico all'host dell'app aperta dopo una pausa della scheda (telefono: scheda in background congelata,
 * ripresa da bfcache, rete cambiata). Quando la pagina torna visibile, riprende ("resume"/"pageshow"), torna la rete
 * ("online") o il canale si chiude: se il canale dell'app non c'e' o non risponde entro PROBE_MS (canale "aperto" ma
 * muto: l'host l'ha perso), riconnessione con il token salvato. Una sola alla volta, fino a 6 nuovi tentativi con
 * attesa crescente (1-30 s) finche' la pagina e' visibile e in rete; avviso "Riconnessione..." sopra l'app mentre avviene. A canale di nuovo
 * aperto l'app riceve "mylan:peer-connected" (viewer-loader.js).
 */
import { t } from "../core/i18n.js?v=1669042733e9";
import { getApiChannel, getActiveChannel, getChannelOwner, dropActiveChannels, onChannelsChanged } from "../webrtc/channel.js?v=1669042733e9";
import { probeChannel } from "../loader/channel-probe.js?v=1669042733e9";
import { sessionKeyOf } from "../loader/session-key.js?v=1669042733e9";
import { initBackgroundReconnect } from "./viewer-loader.js?v=1669042733e9";

const FRESH_MS = 3000, BACKOFF_MS = [1000, 2000, 5000, 10000, 20000, 30000];

function ownChannel(appKey) {
  const ch = getApiChannel() || getActiveChannel();
  return ch && ch.readyState === "open" && getChannelOwner() === appKey ? ch : null;
}

function showState(iframe, on) {
  const box = iframe.parentElement;
  box?.querySelector(".viewer-reconnect-banner")?.remove();
  if (!on || !box) return;
  const bar = document.createElement("div");
  bar.className = "viewer-reconnect-banner";
  bar.setAttribute("role", "status");
  bar.textContent = t("viewer.reconnecting");
  box.prepend(bar);
}

/** Avvia la sorveglianza per l'app aperta; restituisce { ensure, stop }. */
export function watchViewer(iframe, appData) {
  const appKey = sessionKeyOf(appData);
  let busy = false, stopped = false, attempt = 0, retryTimer = null, okAt = 0, watched = null;
  const visible = () => document.visibilityState === "visible";

  async function ensure() {
    clearTimeout(retryTimer);
    if (stopped || busy || !visible() || !navigator.onLine || !appData.reconnectToken) return;
    busy = true;
    try {
      const ch = ownChannel(appKey);
      if (ch && (Date.now() - okAt < FRESH_MS || await probeChannel(ch))) { okAt = Date.now(); attempt = 0; return; }
      if (ch && ownChannel(appKey) === ch) { console.warn("[MyLAN] Channel not answering: reconnecting"); dropActiveChannels(); }
      showState(iframe, true);
      const ok = await initBackgroundReconnect(iframe, appData);
      if (ok) { okAt = Date.now(); attempt = 0; return; }
      // Poi basta: con l'host spento ogni tentativo costa una busta su ntfy. Riprova al prossimo evento (o richiesta).
      if (!stopped && attempt < BACKOFF_MS.length) retryTimer = setTimeout(ensure, BACKOFF_MS[attempt++]);
    } finally {
      busy = false;
      showState(iframe, false);
    }
  }

  const kick = () => { attempt = 0; ensure(); };
  const onVisible = () => { if (visible()) kick(); };
  const onClose = () => { okAt = 0; setTimeout(ensure, 300); }; // dopo un eventuale scambio di canali in corso
  const follow = (ch) => {
    if (watched === ch) return;
    watched?.removeEventListener("close", onClose);
    watched = ch && getChannelOwner() === appKey ? ch : null;
    watched?.addEventListener("close", onClose);
  };
  const unfollow = onChannelsChanged(follow);
  follow(getApiChannel());
  document.addEventListener("visibilitychange", onVisible);
  document.addEventListener("resume", kick);
  window.addEventListener("pageshow", kick);
  window.addEventListener("online", kick);

  function stop() {
    stopped = true;
    clearTimeout(retryTimer);
    unfollow();
    follow(null);
    document.removeEventListener("visibilitychange", onVisible);
    document.removeEventListener("resume", kick);
    window.removeEventListener("pageshow", kick);
    window.removeEventListener("online", kick);
    showState(iframe, false);
  }
  return { ensure: kick, stop };
}
