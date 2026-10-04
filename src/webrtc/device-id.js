/**
 * Gestione dell'identificatore univoco e persistente del dispositivo per MyLAN.
 */
const STORAGE_KEY = "mylan_device_id";

export function getOrCreateDeviceId() {
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id || typeof id !== "string") {
      const bytes = new Uint8Array(6);
      crypto.getRandomValues(bytes);
      let hex = "";
      for (let i = 0; i < bytes.length; i++) {
        hex += bytes[i].toString(16).padStart(2, "0");
      }
      id = "dev_" + hex;
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    return "dev_guest";
  }
}
