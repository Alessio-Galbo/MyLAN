/**
 * Esecuzione dell'handshake WebRTC P2P con busta cifrata end-to-end.
 */
import { t } from "../core/i18n.js?v=e19f7df8665d";
import { inviteKeys } from "../crypto/invite-v2.js?v=e19f7df8665d";
import { sealEnvelope, unsealEnvelope } from "../crypto/envelope.js?v=e19f7df8665d";
import { postEnvelope, pollEnvelope } from "../signaling/client.js?v=e19f7df8665d";
import { createPeer, createFullOffer, applyAnswer } from "./peer.js?v=e19f7df8665d";
import { rememberHostIce, hostIceFor } from "./ice-config.js?v=e19f7df8665d";
import { waitForChannelsOpen, setActiveChannels, setWantedOwner } from "./channel.js?v=e19f7df8665d";
import { sessionKeyOf } from "../loader/session-key.js?v=e19f7df8665d";
import { getOrCreateDeviceId } from "./device-id.js?v=e19f7df8665d";
import { getDeviceMeta } from "./device-meta.js?v=e19f7df8665d";
import { saveApp } from "../storage/app-registry.js?v=e19f7df8665d";

/** protocol: 2 (codici digitati, link con "p=2") o 1 (link degli host meno recenti), src/crypto/invite-v2.js. */
export async function executeHandshake(code, onStatus, protocol = 2) {
  onStatus(t("portal.connecting"), "loading");
  const { offerKey, answerKey, offerTopic, answerTopic } = await inviteKeys(code, protocol);

  const owner = sessionKeyOf({ id: code });
  const { pc, apiChannel, mediaChannel, waitForIce } = createPeer(hostIceFor(owner));
  const offerSdp = await createFullOffer(pc, waitForIce);

  const payload = {
    type: "offer",
    device_id: getOrCreateDeviceId(),
    sdp: offerSdp,
    meta: getDeviceMeta()
  };

  const sealedOffer = await sealEnvelope(payload, offerKey);
  const sent = await postEnvelope(offerTopic, sealedOffer);
  if (!sent) throw new Error(t("portal.rejected"));

  onStatus(t("portal.waiting_approval"), "loading");
  const sealedAnswer = await pollEnvelope(answerTopic, 180000);
  if (!sealedAnswer) throw new Error(t("portal.rejected"));

  const answerPayload = await unsealEnvelope(sealedAnswer, answerKey);
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
