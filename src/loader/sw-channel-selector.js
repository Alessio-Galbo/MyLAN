/**
 * Selezione del canale WebRTC appropriato per il routing Service Worker.
 */
import { getApiChannel, getMediaChannel, getActiveChannel } from "../webrtc/channel.js";

export function selectChannelForPath(path) {
  const isMedia = path.startsWith("/api/v1/player/stream") ||
                  path.startsWith("/api/v1/player/cover") ||
                  path.startsWith("/api/v1/player/download") ||
                  path.startsWith("/api/v1/radio");
  return isMedia ? (getMediaChannel() || getActiveChannel()) : (getApiChannel() || getActiveChannel());
}

export async function waitForChannel(path, maxWaitMs = 15000) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const ch = selectChannelForPath(path);
    if (ch && ch.readyState === "open") return ch;
    await new Promise((r) => setTimeout(r, 120));
  }
  return null;
}
