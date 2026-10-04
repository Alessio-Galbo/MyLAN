/**
 * Riconnessione autonoma P2P tramite token crittografico di ritorno su canale privato.
 */
import { deriveKey } from "../crypto/kdf.js?v=76b805b937bb";
import { deriveTopic } from "../signaling/topics.js?v=76b805b937bb";
import { sealEnvelope, unsealEnvelope } from "../crypto/envelope.js?v=76b805b937bb";
import { postEnvelope, pollEnvelope } from "../signaling/client.js?v=76b805b937bb";
import { createPeer, createFullOffer, applyAnswer } from "./peer.js?v=76b805b937bb";
import { rememberHostIce, hostIceFor } from "./ice-config.js?v=76b805b937bb";
import { waitForChannelsOpen, setActiveChannels } from "./channel.js?v=76b805b937bb";
import { getOrCreateDeviceId } from "./device-id.js?v=76b805b937bb";
import { getDeviceMeta } from "./device-meta.js?v=76b805b937bb";

const inFlight = new Map();

/** Vero mentre una riconnessione e' in corso (src/loader/sw-channel-selector.js aspetta il canale solo allora). */
export const isReconnecting = () => inFlight.size > 0;

/** Riconnessione all'host dell'app "owner" (chiave di sessione); una sola in corso per token. */
export async function reconnectPeer(reconnectToken, owner = "") {
  if (inFlight.has(reconnectToken)) return inFlight.get(reconnectToken);
  const job = (async () => {
    try {
      return await executeReconnect(reconnectToken, owner);
    } finally {
      inFlight.delete(reconnectToken);
    }
  })();
  inFlight.set(reconnectToken, job);
  return job;
}

async function executeReconnect(reconnectToken, owner) {
  if (!reconnectToken) throw new Error("No reconnect token");
  const key = await deriveKey(reconnectToken);
  const offerTopic = await deriveTopic(reconnectToken, "reconnect-offer");
  const answerTopic = await deriveTopic(reconnectToken, "reconnect-answer");

  const { pc, apiChannel, mediaChannel, waitForIce } = createPeer(hostIceFor(owner));
  const offerSdp = await createFullOffer(pc, waitForIce);
  const nonce = Math.random().toString(36).slice(2, 10);

  const payload = {
    type: "offer",
    device_id: getOrCreateDeviceId(),
    sdp: offerSdp,
    nonce,
    meta: getDeviceMeta()
  };

  const sealedOffer = await sealEnvelope(payload, key);
  const sent = await postEnvelope(offerTopic, sealedOffer);
  if (!sent) throw new Error("Post failed");

  const sinceSec = Math.floor(Date.now() / 1000) - 5;
  let targetSdp = "";
  let targetIce;
  const sealedAnswer = await pollEnvelope(answerTopic, 20000, undefined, sinceSec, async (msg) => {
    try {
      const ans = await unsealEnvelope(msg, key);
      if (ans?.sdp && (!ans.nonce || ans.nonce === nonce)) {
        targetSdp = ans.sdp;
        targetIce = ans.ice;
        return true;
      }
    } catch {}
    return false;
  });
  if (!sealedAnswer || !targetSdp) throw new Error("No valid answer");

  rememberHostIce(owner, targetIce); // l'host puo' aver cambiato o tolto il suo TURN
  await applyAnswer(pc, targetSdp);
  await waitForChannelsOpen([apiChannel, mediaChannel], 15000);

  if (!setActiveChannels({ api: apiChannel, media: mediaChannel, owner })) {
    pc.close();
    throw new Error("Another app was opened meanwhile");
  }
  apiChannel.addEventListener("close", () => { try { pc.close(); } catch {} }); // niente peer orfani dopo un canale morto
  return apiChannel;
}
