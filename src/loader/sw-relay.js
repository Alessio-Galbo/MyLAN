/**
 * Scelta della finestra MyLAN che inoltra una richiesta /session/<chiave>/ sul proprio DataChannel (lato Service Worker).
 * Con piu' schede MyLAN aperte "la prima finestra" puo' essere quella sbagliata (Hub o un'altra app): ogni finestra
 * candidata risponde a una sonda dicendo se ospita proprio quel frame (id del client), se mostra quell'app e se ha
 * il canale aperto verso il suo host (src/loader/sw-relay-probe.js). La scelta resta in memoria per poco: il browser
 * puo' fermare il Service Worker quando vuole, e allora si richiede.
 */
const RELAY_PROBE_MS = 400;
const RELAY_TTL_MS = 60000;
const relayMemo = new Map();

function probeRelay(client, appKey, frameId) {
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    const timer = setTimeout(() => resolve(-1), RELAY_PROBE_MS);
    ch.port1.onmessage = (e) => {
      clearTimeout(timer);
      const a = e.data || {};
      resolve((a.exact ? 8 : 0) + (a.viewer ? 4 : 0) + (a.channel ? 2 : 0) + (client.focused ? 1 : 0));
    };
    try {
      client.postMessage({ type: "mylan:relay-probe", appKey, frameId }, [ch.port2]);
    } catch {
      clearTimeout(timer);
      resolve(-1);
    }
  });
}

async function pickRelayClient(appKey, frameId) {
  const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const candidates = all.filter((c) => !c.url.includes("/session/"));
  if (candidates.length <= 1) return candidates[0] || all[0] || null;

  const memoKey = appKey + "|" + (frameId || "");
  const memo = relayMemo.get(memoKey);
  if (memo && memo.until > Date.now()) {
    const hit = candidates.find((c) => c.id === memo.id);
    if (hit) return hit;
  }
  const scores = await Promise.all(candidates.map((c) => probeRelay(c, appKey, frameId)));
  let best = 0;
  scores.forEach((s, i) => { if (s > scores[best]) best = i; });
  // Si ricorda solo una scelta certa (la scheda mostra quell'app): le altre si rivalutano alla richiesta dopo.
  if (scores[best] >= 4) relayMemo.set(memoKey, { id: candidates[best].id, until: Date.now() + RELAY_TTL_MS });
  return candidates[best];
}

// Il frame dell'app chiede il proprio id di client: la sonda lo usa per riconoscere la scheda che lo ospita.
self.addEventListener("message", (e) => {
  if (e.data?.type === "mylan:whoami" && e.source) {
    try { e.source.postMessage({ type: "mylan:whoami", id: e.source.id }); } catch {}
  }
});
