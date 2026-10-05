/**
 * Gestione della connessione RTCPeerConnection e raccolta candidati ICE lato browser.
 */
import { buildIceConfig, hasTurn } from "./ice-config.js?v=1669042733e9";

export function createPeer(hostIce = null) {
  const config = buildIceConfig(hostIce);
  const relay = hasTurn(config);
  const pc = new RTCPeerConnection(config);
  const apiChannel = pc.createDataChannel("mylan-api", { ordered: true });
  const mediaChannel = pc.createDataChannel("mylan-media", { ordered: true });
  apiChannel.binaryType = "arraybuffer";
  mediaChannel.binaryType = "arraybuffer";

  // Raccoglie i candidati e parte: completamento, 400 ms dopo il primo srflx (max 3 s); con un TURN dell'host
  // aspetta invece il primo relay (+600 ms, max 6 s), altrimenti l'offerta partirebbe senza candidati relay.
  const awaited = relay ? "typ relay" : "typ srflx";
  const waitForIce = new Promise((resolve) => {
    let done = false;
    let debounce = null;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(maxTimer);
      clearTimeout(debounce);
      pc.removeEventListener("icegatheringstatechange", onState);
      pc.removeEventListener("icecandidate", onCand);
      resolve();
    };
    const onState = () => { if (pc.iceGatheringState === "complete") finish(); };
    const onCand = (e) => {
      const str = e.candidate?.candidate || "";
      if (str.includes(awaited) && !debounce) debounce = setTimeout(finish, relay ? 600 : 400);
    };
    pc.addEventListener("icegatheringstatechange", onState);
    pc.addEventListener("icecandidate", onCand);
    const maxTimer = setTimeout(finish, relay ? 6000 : 3000);
  });

  return { pc, channel: apiChannel, apiChannel, mediaChannel, waitForIce };
}

export async function createFullOffer(pc, waitForIce) {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIce;
  return pc.localDescription.sdp;
}

export async function applyAnswer(pc, answerSdp) {
  await pc.setRemoteDescription(new RTCSessionDescription({
    type: "answer",
    sdp: answerSdp
  }));
}
