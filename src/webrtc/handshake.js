/**
 * Esecuzione dell'handshake WebRTC P2P con busta cifrata end-to-end.
 */
import { t } from "../core/i18n.js?v=aa3afb9e1dd9";
import { deriveKey } from "../crypto/kdf.js?v=aa3afb9e1dd9";
import { deriveTopic } from "../signaling/topics.js?v=aa3afb9e1dd9";
import { sealEnvelope, unsealEnvelope } from "../crypto/envelope.js?v=aa3afb9e1dd9";
import { postEnvelope, pollEnvelope } from "../signaling/client.js?v=aa3afb9e1dd9";
import { createPeer, createFullOffer, applyAnswer } from "./peer.js?v=aa3afb9e1dd9";
import { rememberHostIce, hostIceFor } from "./ice-config.js?v=aa3afb9e1dd9";
import { waitForChannelsOpen, setActiveChannels, setWantedOwner } from "./channel.js?v=aa3afb9e1dd9";
import { sessionKeyOf } from "../loader/session-key.js?v=aa3afb9e1dd9";
import { getOrCreateDeviceId } from "./device-id.js?v=aa3afb9e1dd9";
import { getDeviceMeta } from "./device-meta.js?v=aa3afb9e1dd9";
import { saveApp } from "../storage/app-registry.js?v=aa3afb9e1dd9";

export async function executeHandshake(code, onStatus) {
  onStatus(t("portal.connecting"), "loading");
  const key = await deriveKey(code);
  const offerTopic = await deriveTopic(code, "offer");
  const answerTopic = await deriveTopic(code, "answer");

  const owner = sessionKeyOf({ id: code });
  const { pc, apiChannel, mediaChannel, waitForIce } = createPeer(hostIceFor(owner));
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

  rememberHostIce(owner, answerPayload.ice);
  if (answerPayload.reconnect_token) {
    saveApp({ id: code, code, reconnectToken: answerPayload.reconnect_token });
  }

  onStatus(t("portal.establishing_p2p"), "loading");
  await applyAnswer(pc, answerPayload.sdp);
  try {
    await waitForChannelsOpen([apiChannel, mediaChannel], 30000);
  } catch {
    pc.close();
    throw new Error(t("portal.p2p_blocked"));
  }

  setWantedOwner(owner);
  setActiveChannels({ api: apiChannel, media: mediaChannel, owner });
  onStatus(t("portal.connected"), "success");
  return { channel: apiChannel, reconnectToken: answerPayload.reconnect_token || null };
}
