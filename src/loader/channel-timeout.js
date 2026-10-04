/**
 * Tempo massimo senza notizie dall'host per una richiesta sul DataChannel (docs/APP_SPEC.md §4). Si riparte a ogni
 * messaggio della richiesta (inizio o pezzo): una risposta lunga ma viva non scade mai; un host che tace (canale
 * aperto ma nessuna risposta) non lascia piu' la richiesta appesa per sempre. Il margine supera i 120 s entro cui un
 * host ben fatto risponde comunque (anche solo con 504).
 */
export const IDLE_TIMEOUT_MS = 130000;

/** Timer da riarmare con touch(); alla scadenza chiede all'host di smettere ({id, type:"abort"}) e chiama onExpire. */
export function requestIdleTimer(channel, reqId, onExpire, ms = IDLE_TIMEOUT_MS) {
  let timer = null;
  const expire = () => {
    try { channel.send(JSON.stringify({ id: reqId, type: "abort" })); } catch {}
    onExpire(Object.assign(new Error("No answer from the host"), { status: 504 }));
  };
  const touch = () => { clearTimeout(timer); timer = setTimeout(expire, ms); };
  touch();
  return { touch, stop: () => clearTimeout(timer) };
}
