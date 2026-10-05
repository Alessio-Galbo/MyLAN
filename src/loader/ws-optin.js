/**
 * L'app ha chiesto il WebSocket sul DataChannel ("websocket": true in /.well-known/mylan.json)? Le app salvate prima
 * di MyLAN 2026-10-05 non hanno il dato: si legge il manifest una volta sul canale e si salva con l'app.
 */
import { sendChannelRequest } from "./channel-fetch.js?v=47145387c383";
import { saveApp } from "../storage/app-registry.js?v=47145387c383";

/** true / false; null se non si sa ancora (dato mancante e host non raggiungibile ora). */
export async function websocketAllowed(appData, channel) {
  if (typeof appData.websocket === "boolean") return appData.websocket;
  if (!channel) return null;
  try {
    const res = await sendChannelRequest(channel, "/.well-known/mylan.json");
    if (res.status !== 200 && res.status !== 404) return null;
    const manifest = res.status === 200 ? await res.json().catch(() => null) : null;
    appData.websocket = manifest?.websocket === true;
    saveApp({ ...appData });
    return appData.websocket;
  } catch {
    return null;
  }
}
