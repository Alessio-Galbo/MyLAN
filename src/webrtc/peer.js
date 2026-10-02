/**
 * Gestione della connessione RTCPeerConnection e raccolta candidati ICE lato browser.
 */
import { ICE_CONFIG } from "./ice-config.js";

export function createPeer() {
  const pc = new RTCPeerConnection(ICE_CONFIG);
  const apiChannel = pc.createDataChannel("mylan-api", { ordered: true });
  const mediaChannel = pc.createDataChannel("mylan-media", { ordered: true });
  apiChannel.binaryType = "arraybuffer";
  mediaChannel.binaryType = "arraybuffer";

  const waitForIce = new Promise((resolve) => {
    let done = false;
    let relayDebounce = null;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(maxTimer);
      clearTimeout(relayDebounce);
      pc.removeEventListener("icegatheringstatechange", onState);
      pc.removeEventListener("icecandidate", onCand);
      resolve();
    };
    const onState = () => { if (pc.iceGatheringState === "complete") finish(); };
    const onCand = (e) => {
      const str = e.candidate?.candidate || "";
      if (str.includes("typ relay") && !relayDebounce) relayDebounce = setTimeout(finish, 600);
    };
    pc.addEventListener("icegatheringstatechange", onState);
    pc.addEventListener("icecandidate", onCand);
    const maxTimer = setTimeout(finish, 6000);
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
