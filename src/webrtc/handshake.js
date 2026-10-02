/**
 * Esecuzione dell'handshake WebRTC P2P con busta cifrata end-to-end.
 */
import { t } from "../core/i18n.js";
import { deriveKey } from "../crypto/kdf.js";
import { deriveTopic } from "../signaling/topics.js";
import { sealEnvelope, unsealEnvelope } from "../crypto/envelope.js";
import { postEnvelope, pollEnvelope } from "../signaling/client.js";
import { createPeer, createFullOffer, applyAnswer } from "./peer.js";
import { waitForChannelsOpen, setActiveChannels } from "./channel.js";
import { getOrCreateDeviceId } from "./device-id.js";
import { getDeviceMeta } from "./device-meta.js";
import { saveApp } from "../storage/app-registry.js";

export async function executeHandshake(code, onStatus) {
  onStatus(t("portal.connecting"), "loading");
  const key = await deriveKey(code);
  const offerTopic = await deriveTopic(code, "offer");
  const answerTopic = await deriveTopic(code, "answer");

  const { pc, apiChannel, mediaChannel, waitForIce } = createPeer();
  const offerSdp = await createFullOffer(pc, waitForIce);

  const payload = {
    type: "offer",
    device_id: getOrCreateDeviceId(),
    sdp: offerSdp,
    meta: getDeviceMeta()
  };

  const sealedOffer = await sealEnvelope(payload, key);
  const sent = await postEnvelope(offerTopic, sealedOffer);
  if (!sent) throw new Error(t("portal.rejected"));

  onStatus(t("portal.waiting_approval"), "loading");
  const sealedAnswer = await pollEnvelope(answerTopic, 180000);
  if (!sealedAnswer) throw new Error(t("portal.rejected"));

  const answerPayload = await unsealEnvelope(sealedAnswer, key);
  if (!answerPayload?.sdp) throw new Error(t("portal.rejected"));

  if (answerPayload.reconnect_token) {
    saveApp({ id: code, code, reconnectToken: answerPayload.reconnect_token });
  }

  onStatus(t("portal.establishing_p2p"), "loading");
  await applyAnswer(pc, answerPayload.sdp);
  await waitForChannelsOpen([apiChannel, mediaChannel], 30000);

  setActiveChannels({ api: apiChannel, media: mediaChannel });
  onStatus(t("portal.connected"), "success");
  return { channel: apiChannel, reconnectToken: answerPayload.reconnect_token || null };
}
