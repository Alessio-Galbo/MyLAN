/**
 * Risincronizzazione degli asset dell'applicazione su richiesta dell'iframe (solo nella cache di quell'app).
 */
import { getActiveChannel, getApiChannel, getChannelOwner } from "../webrtc/channel.js";
import { downloadAppBundle } from "../loader/app-downloader.js";
import { sessionKeyOf, sessionBaseUrl } from "../loader/session-key.js";

let isUpdating = false;

export async function syncAppUpdate(iframe, appData) {
  if (isUpdating) return;
  const appKey = sessionKeyOf(appData);
  const channel = getApiChannel() || getActiveChannel();
  if (!channel || channel.readyState !== "open" || getChannelOwner() !== appKey) return;
  isUpdating = true;
  try {
    await downloadAppBundle(channel, appKey, () => {}, () => {});
    if (iframe) iframe.src = sessionBaseUrl(appKey);
  } catch (err) {
    console.warn("[MyLAN] Update sync failed:", err);
  } finally {
    isUpdating = false;
  }
}
