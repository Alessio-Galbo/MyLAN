/**
 * Pipe di streaming tra MessagePort del Service Worker e ReadableStream Response.
 */
function bridgeStreamRequest(bridgeClient, reqData, signal, transfer = []) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    let streamController = null;
    let resolved = false;
    let streamClosed = false;

    channel.port1.onmessage = (msgEvent) => {
      const msg = msgEvent.data;
      if (!msg) return;
      if (msg.type === "error") {
        if (!resolved) {
          resolved = true;
          resolve(new Response(msg.error || "P2P Error", { status: msg.status || 503 }));
        }
      } else if (msg.type === "start") {
        const stream = new ReadableStream({
          start(ctrl) { streamController = ctrl; },
          cancel() {
            streamClosed = true;
            try { channel.port1.postMessage({ type: "abort" }); } catch {}
          }
        });
        resolved = true;
        resolve(new Response(stream, { status: msg.status || 200, headers: msg.headers || {} }));
      } else if (msg.type === "chunk") {
        if (streamController && !streamClosed && streamController.desiredSize !== null) {
          if (msg.buffer) {
            try { streamController.enqueue(new Uint8Array(msg.buffer)); } catch { streamClosed = true; }
          }
          if (!msg.more && !streamClosed) {
            streamClosed = true;
            try { streamController.close(); } catch {}
          }
        }
      }
    };

    if (signal) {
      signal.addEventListener("abort", () => {
        streamClosed = true;
        try { channel.port1.postMessage({ type: "abort" }); } catch {}
        if (streamController) try { streamController.error(new Error("Aborted")); } catch {}
      });
    }

    bridgeClient.postMessage(reqData, [channel.port2, ...transfer]);
  });
}

// /session/<chiave>/<percorso sull'host>
function parseSessionUrl(url) {
  const rest = url.pathname.slice(url.pathname.indexOf("/session/") + "/session/".length);
  const slash = rest.indexOf("/");
  const appKey = slash < 0 ? rest : rest.slice(0, slash);
  const path = (slash < 0 ? "/" : rest.slice(slash)) + url.search;
  return /^a[0-9a-z]{14}$/.test(appKey) ? { appKey, path } : null;
}
