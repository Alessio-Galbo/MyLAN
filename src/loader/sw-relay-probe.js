/**
 * Risposta della pagina alla sonda del Service Worker (src/loader/sw-relay.js): questa scheda e' quella giusta
 * per inoltrare le richieste dell'app "appKey"? Il frame dell'app conosce il proprio id di client
 * (window.__mylanClientId, impostato dallo script iniettato da sandbox-bridge.js).
 */
import { getActiveChannel, getChannelOwner } from "../webrtc/channel.js?v=47145387c383";

export function answerRelayProbe(evt) {
  const port = evt.ports?.[0];
  if (!port) return;
  const { appKey = "", frameId = "" } = evt.data || {};
  const frame = document.querySelector("iframe.viewer-iframe");
  let exact = false;
  try { exact = Boolean(frameId) && frame?.contentWindow?.__mylanClientId === frameId; } catch {}
  const viewer = Boolean(appKey && frame && frame.src.includes(`/session/${appKey}/`));
  const ch = getActiveChannel();
  const channel = Boolean(appKey) && getChannelOwner() === appKey && ch?.readyState === "open";
  port.postMessage({ exact, viewer, channel });
}
