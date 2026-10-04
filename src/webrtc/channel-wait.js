/**
 * Attesa dell'apertura dei DataChannel WebRTC (con tempo massimo), separata dallo stato dei canali attivi (channel.js).
 */
export function waitForChannelOpen(channel, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    if (!channel) return reject(new Error("No channel provided"));
    if (channel.readyState === "open") return resolve(channel);
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("P2P DataChannel timeout"));
    }, timeoutMs);
    const onOpen = () => { cleanup(); resolve(channel); };
    const onError = (err) => { cleanup(); reject(err); };
    function cleanup() {
      clearTimeout(timer);
      channel.removeEventListener("open", onOpen);
      channel.removeEventListener("error", onError);
    }
    channel.addEventListener("open", onOpen);
    channel.addEventListener("error", onError);
  });
}

export function waitForChannelsOpen(channels = [], timeoutMs = 30000) {
  return Promise.all(channels.map((ch) => waitForChannelOpen(ch, timeoutMs)));
}
