/**
 * Bridge tra Service Worker e canale WebRTC DataChannel della finestra principale.
 */
import { selectChannelForPath, waitForChannel } from "./sw-channel-selector.js?v=47145387c383";
import { sendStreamingChannelRequest } from "./channel-stream.js?v=47145387c383";
import { patchIndexHtml, getShellHtml, hasShellHtml } from "./html-patcher.js?v=47145387c383";
import { answerRelayProbe } from "./sw-relay-probe.js?v=47145387c383";

function respondWithHtml(port, html, isFallback = false) {
  const buffer = new TextEncoder().encode(html).buffer;
  const headers = { "content-type": "text/html; charset=utf-8" };
  if (isFallback) headers["x-mylan-fallback"] = "1";
  port.postMessage({ type: "start", status: 200, headers });
  port.postMessage({ type: "chunk", buffer, more: false }, [buffer]);
}

export async function initServiceWorkerBridge() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register("./sw.js", { scope: "./" });
    if (reg) reg.update().catch(() => {});
  } catch {}

  navigator.serviceWorker.addEventListener("message", async (evt) => {
    if (evt.data?.type === "mylan:relay-probe") return answerRelayProbe(evt);
    if (evt.data?.type !== "mylan:sw-fetch") return;
    const port = evt.ports?.[0];
    if (!port) return;

    const appKey = evt.data.appKey || "";
    if (!appKey) return port.postMessage({ type: "error", error: "Unknown MyLAN session", status: 404 });
    const isRoot = evt.data.path === "/" || evt.data.path === "/index.html";
    const reqHeaders = evt.data.headers || {};
    let channel = selectChannelForPath(evt.data.path || "", reqHeaders, appKey);
    if ((!channel || channel.readyState !== "open") && isRoot && hasShellHtml(appKey)) {
      return respondWithHtml(port, getShellHtml(appKey), false);
    }
    if (!channel || channel.readyState !== "open") {
      channel = await waitForChannel(evt.data.path || "", isRoot ? 3500 : 15000, reqHeaders, appKey);
    }
    if (!channel || channel.readyState !== "open") {
      if (isRoot) return respondWithHtml(port, getShellHtml(appKey), true);
      console.warn("[MyLAN] SW fetch: DataChannel not ready for", evt.data.path);
      port.postMessage({ type: "error", error: "DataChannel not ready", status: 503 });
      return;
    }

    const abortCtrl = new AbortController();
    port.onmessage = (e) => { if (e.data?.type === "abort") abortCtrl.abort(); };

    try {
      await sendStreamingChannelRequest(
        channel,
        evt.data.path,
        { method: evt.data.method, headers: evt.data.headers, body: evt.data.body, signal: abortCtrl.signal },
        (start) => { if (!isRoot) port.postMessage({ type: "start", status: start.status, headers: start.headers }); },
        (chk) => {
          if (isRoot || abortCtrl.signal.aborted) return;
          try {
            const buf = chk.buffer || (chk.binary ? chk.binary.buffer.slice(chk.binary.byteOffset, chk.binary.byteOffset + chk.binary.byteLength) : null);
            if (buf) {
              port.postMessage({ type: "chunk", buffer: buf, more: chk.more }, [buf]);
            } else {
              const b = chk.data ? Uint8Array.from(atob(chk.data), (c) => c.charCodeAt(0)) : null;
              port.postMessage({ type: "chunk", buffer: b?.buffer, more: chk.more }, b ? [b.buffer] : []);
            }
          } catch {}
        },
        (fullText) => {
          if (isRoot) respondWithHtml(port, new TextDecoder().decode(patchIndexHtml(fullText, appKey)), false);
        }
      );
    } catch (err) {
      if (err.name !== "AbortError") {
        port.postMessage({ type: "error", error: err.message || "Fetch error", status: err.status || 500 });
      }
    }
  });
}
