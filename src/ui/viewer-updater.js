/**
 * Risincronizzazione degli asset dell'applicazione su richiesta dell'iframe.
 */
import { getActiveChannel, getApiChannel } from "../webrtc/channel.js";
import { downloadAppBundle } from "../loader/app-downloader.js";

let isUpdating = false;

export async function syncAppUpdate(iframe, appData) {
  if (isUpdating) return;
  const channel = getApiChannel() || getActiveChannel();
  if (!channel || channel.readyState !== "open") return;
  isUpdating = true;
  try {
    await downloadAppBundle(channel, () => {}, () => {});
    if (iframe) iframe.src = appData.url || "./session/";
  } catch (err) {
    console.warn("[MyLAN] Update sync failed:", err);
  } finally {
    isUpdating = false;
  }
}
