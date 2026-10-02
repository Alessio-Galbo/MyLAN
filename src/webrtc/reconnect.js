/**
 * Riconnessione autonoma P2P tramite token crittografico di ritorno su canale privato.
 */
import { deriveKey } from "../crypto/kdf.js";
import { deriveTopic } from "../signaling/topics.js";
import { sealEnvelope, unsealEnvelope } from "../crypto/envelope.js";
import { postEnvelope, pollEnvelope } from "../signaling/client.js";
import { createPeer, createFullOffer, applyAnswer } from "./peer.js";
import { waitForChannelsOpen, setActiveChannels } from "./channel.js";
import { getOrCreateDeviceId } from "./device-id.js";
import { getDeviceMeta } from "./device-meta.js";

let inFlightPromise = null;

export async function reconnectPeer(reconnectToken) {
  if (inFlightPromise) return inFlightPromise;
  inFlightPromise = (async () => {
    try {
      return await executeReconnect(reconnectToken);
    } finally {
      inFlightPromise = null;
    }
  })();
  return inFlightPromise;
}

async function executeReconnect(reconnectToken) {
  if (!reconnectToken) throw new Error("No reconnect token");
  const key = await deriveKey(reconnectToken);
  const offerTopic = await deriveTopic(reconnectToken, "reconnect-offer");
  const answerTopic = await deriveTopic(reconnectToken, "reconnect-answer");

  const { pc, apiChannel, mediaChannel, waitForIce } = createPeer();
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
  const sealedAnswer = await pollEnvelope(answerTopic, 20000, undefined, sinceSec, async (msg) => {
    try {
      const ans = await unsealEnvelope(msg, key);
      if (ans?.sdp && (!ans.nonce || ans.nonce === nonce)) {
        targetSdp = ans.sdp;
        return true;
      }
    } catch {}
    return false;
  });
  if (!sealedAnswer || !targetSdp) throw new Error("No valid answer");

  await applyAnswer(pc, targetSdp);
  await waitForChannelsOpen([apiChannel, mediaChannel], 15000);

  setActiveChannels({ api: apiChannel, media: mediaChannel });
  return apiChannel;
}
