/**
 * Gestione degli eventi e del ciclo di vita del DataChannel WebRTC.
 */
let activeApiChannel = null;
let activeMediaChannel = null;
let activeOwner = "";
let wantedOwner = "";
const changeListeners = new Set();

/** fn(apiChannel) a ogni cambio dei canali attivi (src/ui/viewer-watchdog.js ne osserva la chiusura). */
export function onChannelsChanged(fn) {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

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
  changeListeners.forEach((fn) => { try { fn(activeApiChannel); } catch {} });
  return true;
}

/** Canale "aperto" ma muto (host sparito senza chiudere): si chiude, le richieste in corso falliscono subito. */
export function dropActiveChannels() {
  closeQuietly(activeApiChannel, []);
  closeQuietly(activeMediaChannel, []);
  activeApiChannel = activeMediaChannel = null;
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

export { waitForChannelOpen, waitForChannelsOpen } from "./channel-wait.js?v=aa3afb9e1dd9";
