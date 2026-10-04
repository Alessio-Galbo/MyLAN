/**
 * Prova di vita del DataChannel: dopo un congelamento della scheda o un cambio di rete il canale puo' risultare
 * "open" anche se l'host non c'e' piu' (src/ui/viewer-watchdog.js). Una richiesta leggera a /.well-known/mylan.json:
 * qualunque risposta (anche 404) entro il tempo massimo dimostra che l'host risponde.
 */
import { sendChannelRequest } from "./channel-fetch.js";

export const PROBE_MS = 4000;

/** true se l'host risponde entro ms; false se tace o il canale si chiude. */
export function probeChannel(ch, ms = PROBE_MS) {
  const answer = sendChannelRequest(ch, "/.well-known/mylan.json").then(() => true, () => false);
  return Promise.race([answer, new Promise((r) => setTimeout(() => r(false), ms))]);
}
