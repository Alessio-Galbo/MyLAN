/**
 * Gestione degli eventi e del ciclo di vita del DataChannel WebRTC.
 */
let activeApiChannel = null;
let activeMediaChannel = null;
let activeOwner = "";
let wantedOwner = "";

/** Chiave di sessione dell'app aperta: i canali di un altro host non vengono piu' adottati. */
export function setWantedOwner(owner) {
  wantedOwner = owner || "";
}

export function getChannelOwner() {
  return activeOwner;
}

function closeQuietly(ch, keep) {
  if (ch && !keep.includes(ch)) try { ch.close(); } catch {}
}

/** Adotta i canali dell'host "owner"; quelli precedenti (altro host o vecchio collegamento) vengono chiusi. */
export function setActiveChannels({ api, media, owner = "" }) {
  if (wantedOwner && owner && owner !== wantedOwner) {
    closeQuietly(api, []);
    closeQuietly(media, []);
    return false;
  }
  closeQuietly(activeApiChannel, [api, media]);
  closeQuietly(activeMediaChannel, [api, media]);
  if (api) activeApiChannel = api;
  if (media) activeMediaChannel = media;
  activeOwner = owner;
  return true;
}

export function setActiveChannel(channel) {
  activeApiChannel = channel;
  if (!activeMediaChannel) activeMediaChannel = channel;
}

export function getApiChannel() {
  return activeApiChannel;
}

export function getMediaChannel() {
  return activeMediaChannel || activeApiChannel;
}

export function getActiveChannel() {
  return activeApiChannel;
}

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
