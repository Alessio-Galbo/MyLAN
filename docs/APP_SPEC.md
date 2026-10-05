# MyLAN Application Integration Specification

This specification defines the standard discovery protocol, DataChannel wire format, and container bridge interfaces for web applications connecting through the MyLAN WebRTC P2P gateway.

For the overall picture (how the HTTPS container works, what the host must implement for signaling, NAT/CGNAT behaviour, per-app PWA installation, security model and known limits) see [INTEGRATION.md](INTEGRATION.md).

---

## 1. Overview & Container

MyLAN acts as a trusted HTTPS trampoline and peer-to-peer container:
* The remote web application is executed inside an iframe at `/session/<key>/`, one key per saved app (derived from the app's stable id, `src/loader/session-key.js`).
* The iframe is **not** an isolated sandbox: it runs on MyLAN's origin. Each app gets its own namespaced Web Storage (`localStorage` / `sessionStorage` keys stored as `mylan-app:<key>:<name>`), which prevents collisions and accidental reads but is not a security boundary (see [INTEGRATION.md §8](INTEGRATION.md#8-security-model)).
* MyLAN's outer Service Worker (`sw.js`) intercepts all requests under `/session/<key>/` and routes them over the WebRTC DataChannels of that app's host only, through the MyLAN tab that hosts the frame (`src/loader/sw-relay.js`).
* Static assets (HTML, CSS, JS modules) are automatically discovered and cached into one cache per app, `mylan-session-v3:<key>`, for instant offline loading and hard-refresh resilience. Only `GET` responses outside `/api/` are cached, plus the `GET` prefixes the app declares in `runtime_cache` (kept in `mylan-runtime:<key>`, see §2.1). Removing the app from the Hub deletes its caches, initial page and Web Storage.

---

## 2. Application Discovery & Manifest

During pairing and initial synchronization, MyLAN queries the remote application to display its identity (title, description, icon, theme color) and persist it in the user's App Hub.

### Resolution Priority:
1. `GET /.well-known/mylan.json` (Recommended dedicated manifest)
2. `GET /manifest.json` (Standard W3C Web App Manifest)
3. HTML Fallback (`<title>`, `<meta name="description">`, `<link rel="icon">`)

### Manifest Format Example (`.well-known/mylan.json`):
```json
{
  "name": "My Web Application",
  "short_name": "WebApp",
  "description": "Secure self-hosted P2P dashboard",
  "version": "1.0.0",
  "theme_color": "#6366f1",
  "media_paths": ["/files/", "/api/stream/"],
  "chunked_uploads": true,
  "websocket": true,
  "update_check": { "url": "/api/version", "field": "shell" },
  "runtime_cache": [
    { "prefix": "/api/covers/", "strategy": "stale-while-revalidate", "keep_params": ["size", "v"], "version_param": "v" }
  ],
  "background_color": "#0b0f19",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

`websocket` (optional, default `false`): the app may open WebSockets to its own origin and the host carries them on
the DataChannel (§4.4). Without it, a WebSocket to the app's origin never opens and fires no event (as in MyLAN
before 2026-10-05), so apps that do not expect it are not affected. Apps saved before this field read it once from
`/.well-known/mylan.json` the first time they open a WebSocket.

### Recommended icon set (installed app)
Declare in `icons` at least **192 and 512 px, both `any` and `maskable`** (PNG, square), as above. When the app is
installed from MyLAN (`?app=<slug>`), MyLAN downloads every declared icon over the DataChannel (at most 8, 1 MB each),
keeps it in its manifest cache and lists all of them, with sizes and purpose, in the installed app's manifest:
Android builds the splash screen from the largest icon and the home-screen icon from the `maskable` one (full-bleed
background, content inside the central 80%). `background_color` (splash background) and `theme_color` come from the
app too. If the app declares no `any` icon of 512 px, MyLAN upscales the largest one to 512 on a canvas: only a
fallback, visibly blurred on the splash screen. Apps saved before this read their icons once at the next connection.

### 2.1 `runtime_cache` (optional)
Array (at most 10) of rules for `GET` resources that MyLAN may keep for offline use, also under `/api/`:

| Field | Meaning |
|---|---|
| `prefix` | Path prefix on the host, starting with `/` (required) |
| `strategy` | `cache-first` (default), `stale-while-revalidate` (saved copy at once, background check with `If-None-Match`) or `network-first` (host first, saved copy if it fails or exceeds `timeout_ms`) |
| `max_entries` | Optional cap on the number of entries of this rule (the oldest go first). Absent (recommended) = no fixed number: only the quota guard below applies |
| `max_entry_kb` | Default 1024, at most 4096; larger responses are not kept |
| `timeout_ms` | `network-first` only: 500-15000, default 4000 |
| `keep_params` | Query parameters that form the cache key (others are ignored); without it the full URL is the key |
| `version_param` | A URL with this parameter is immutable (served cache-first); a new value replaces the other saved values of the same resource; with the host unreachable and no exact copy, another saved value is served |

Only `200` responses are kept (never `Range` requests or MyLAN fallbacks). With the host unreachable a saved entry is answered immediately; an entry never seen gets `503`. While the app's channel is not open yet (launch, reconnection in progress, host off) `cache-first` and `stale-while-revalidate` entries never wait for it: the exact entry, or else another saved value of the same resource (other `version_param` or `keep_params` values), is answered at once, and the exact one is fetched and saved in the background once the channel opens. Only `network-first` waits, at most `timeout_ms`. Rules not declared any more are purged at the next install/update.

**Quota guard.** There is no default number of entries. After a write MyLAN checks the storage estimate of its origin
(`navigator.storage.estimate()`, at most once a minute): only when usage is above 80% of the quota it removes the
oldest runtime entries (insertion order; other apps' runtime caches first, then the app that just wrote) until usage
is back to 70%. App pages and files (`mylan-session-*`), the app's rules, IndexedDB and Web Storage are never touched:
an origin that runs out of quota can be evicted by the browser as a whole, losing all of them. MyLAN also asks the
browser to make its storage persistent (`navigator.storage.persist()`) when an app is installed or updated.

**Removed resources.** Entries of resources deleted on your host (e.g. the cover of a deleted item) are not reachable
any more but keep their space until the quota guard needs it. Tell MyLAN to drop them at once with
`mylan:runtime-cache-drop` (§5.1).

### Supported Icon Formats:
* **Binary Images**: PNG, WebP, JPEG, SVG served over DataChannel (automatically converted to data URIs).
* **Vector SVG Strings**: Raw inline SVG markup `<svg ...>...</svg>` is natively supported for crisp, resolution-independent rendering in the Hub and dynamic tab favicons.

---

## 3. Dual DataChannel Multiplexing

To guarantee responsive UI interactions during heavy media transfers, MyLAN establishes two multiplexed WebRTC DataChannels:

| Channel Label | Reliability | Ordering | Purpose |
|---|---|---|---|
| `mylan-api` | Reliable | Ordered | Standard REST/RPC requests (`GET`, `POST`, `PUT`, `DELETE`), JSON APIs, manifests, and scripts. |
| `mylan-media` | Reliable | Ordered | High-throughput transfers: every request carrying a `Range` header, plus the path prefixes the app lists in `media_paths` of `/.well-known/mylan.json`. |

The host must answer each request on the channel it arrived on.

Channels are negotiated with a default timeout of 30 seconds to support high-latency cellular networks (4G/5G). ICE uses public STUN servers by default (MyLAN ships no TURN relay): gathering collects host and server-reflexive (`typ srflx`) candidates and sends the offer as soon as gathering completes, shortly after the first `srflx` candidate, or after at most 3 seconds. A host app may send its own ICE servers in the optional `ice` field of its encrypted answers (an array of `RTCIceServer` objects: `urls` with `stun:`/`turn:`/`turns:` URLs, optional `username` and `credential`); MyLAN merges them with its defaults for that app from the next connection on and, when a TURN is among them, waits for the first `typ relay` candidate (+600 ms, at most 6 seconds). See INTEGRATION §6. If the DataChannels do not open within 30 seconds, the portal shows that the two networks do not allow a direct connection.

---

## 4. DataChannel Wire Protocol

Requests intercepted by MyLAN's Service Worker are streamed over the appropriate DataChannel.

### 4.1 Client Request Payload (JSON string):
```json
{
  "id": "r_1710000000_1",
  "method": "GET",
  "path": "/api/v1/status",
  "headers": {
    "accept": "application/json",
    "x-device-id": "dev_abc123"
  },
  "body": ""
}
```

* **`body`**: base64 of the **exact** request bytes (JSON, text, `Blob`, files, `FormData` multipart). Decode it to bytes, never to text. The whole JSON message must fit one DataChannel message (64 KB, the usual `a=max-message-size`), so about 46 KB of body. Earlier MyLAN versions also sent the same value as `body_b64`; it is not sent any more (both copies made messages over ~24 KB of body exceed the limit, and the browser refused to send them).
* **Larger requests** (chunked variant), only when the app declares `"chunked_uploads": true` in `/.well-known/mylan.json`: the JSON carries `"body": ""`, `"body_chunked": true` and `"body_size": N`, and is followed on the same channel by binary frames in the format of §4.3 (`0x42` + ID length + `more` flag + ASCII request ID + up to 60 KB of payload). The host concatenates the payloads and handles the request after the frame with `more = 0`.
* Without the flag, a request that does not fit one message is never sent: MyLAN answers the app locally with HTTP `413`.
* **No answer**: if no message of a request (start or chunk) arrives for 130 s, MyLAN sends `{"id": ..., "type": "abort"}` and fails the request with `504`. Each new message of the request restarts the 130 s.

### 4.2 Host Response Start (Headers):
```json
{
  "id": "r_1710000000_1",
  "type": "start",
  "status": 200,
  "headers": {
    "content-type": "application/json; charset=utf-8"
  }
}
```

### 4.3 Host Response Chunks:
Responses can be streamed in chunks up to 64 KB using either:
1. **Raw Binary Chunks (High performance, recommended for media)**:
   - Header byte `0x42` ('B') + 1 byte ID length + 1 byte `more` flag (1 or 0) + ASCII request ID + raw bytes.
2. **JSON Base64 Chunks**:
   ```json
   {
     "id": "r_1710000000_1",
     "type": "chunk",
     "data": "<base64_encoded_payload>",
     "more": false
   }
   ```

### 4.4 WebSocket frames (only for apps with `"websocket": true`)
Inside the iframe, `new WebSocket("ws(s)://<MyLAN host>/<path>")` (also under `/session/<key>/`, which is stripped)
is a MyLAN object with the standard API (`readyState`, `send`, `close`, `binaryType`, `onopen`/`onmessage`/`onerror`/
`onclose` and `addEventListener`, `WebSocket.OPEN`...; `WebSocket.mylanTunnel === true`); WebSockets to other hosts
are the browser's own. MyLAN carries each connection as JSON messages on `mylan-api`, `type` and `id` first:

| Direction | Message | Meaning |
|---|---|---|
| MyLAN -> host | `{"type":"ws-open","id":"w_...","path":"/ws?x=1","headers":{},"protocols":["p1"]}` | Open a WebSocket on `path` (query included) |
| host -> MyLAN | `{"type":"ws-accept","id":...,"protocol":"p1"\|null}` | Accepted: the app gets `open` |
| both | `{"type":"ws-msg","id":...,"text":"..."}` or `"bin":"<base64>"`, plus `"more": true\|false` | One message; a long one is split into several `ws-msg` with `more: true` until the last (`more: false`). MyLAN sends at most 8000 characters of text (48000 of base64) per frame, so every frame stays under 64 KB; do the same |
| both | `{"type":"ws-close","id":...,"code":1000,"reason":""}` | Closed by that side; the host also uses it to refuse an open (e.g. `1008` path not allowed, `1013` too many connections) |

When the channel closes (host lost, reconnection, the viewer is closed) every connection ends: the app gets `error`
and `close` with code `1006` (or `1001` when the viewer closes), exactly like a lost network, and should reconnect
with a new `WebSocket` as it would in a LAN; MyLAN waits for a reconnection in progress (up to 10 s) before failing
a new one. Messages sent while disconnected are lost (no replay). The host decides who the client is from the peer
of the channel (never from headers or messages), allows only the paths it wants and limits connections per channel.

---

## 5. Container Bridge Protocol (`postMessage`)

Applications running inside the MyLAN iframe can communicate with the MyLAN parent container using `window.parent.postMessage`.

### 5.1 Messages Sent by Child App to MyLAN:
* **`mylan:register`**: Dynamic app registration and custom branding:
  ```javascript
  window.parent.postMessage({
    type: "mylan:register",
    meta: {
      title: "My Dashboard",
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/></svg>'
    }
  }, "*");
  ```
* **`mylan:exit`**: Cleanly exits the viewer and returns to the MyLAN Hub:
  ```javascript
  window.parent.postMessage({ type: "mylan:exit" }, "*");
  ```
* **`mylan:request-reconnect`**: Requests background WebRTC reconnection if the host connection drops:
  ```javascript
  window.parent.postMessage({ type: "mylan:request-reconnect" }, "*");
  ```
* **`mylan:runtime-cache-drop`** `{ paths }`: the resources at these host paths were removed; MyLAN deletes their
  saved copies (every query/size/version) from your app's runtime cache only, and only paths covered by one of your
  `runtime_cache` rules (at most 10000 per message; anything else is ignored). Send it when your app learns of the
  removal (e.g. a sync that reports deleted items):
  ```javascript
  window.parent.postMessage({ type: "mylan:runtime-cache-drop", paths: ["/api/covers/42", "/api/covers/43"] }, "*");
  ```
* **`mylan:app-boot-error`** `{ message }`: sent automatically by the script MyLAN injects (you never send it): the
  page failed to start in its first 10 s (uncaught error, module link `SyntaxError`, script or dynamic import that
  failed to load). MyLAN repairs the cached copy once per session and reloads the iframe, or shows a banner if the host
  is unreachable.
* **`mylan:app-updated-ack`**: answer to `mylan:app-updated` (see 5.2).
* **`mylan:sync-update`**: Asks MyLAN to compare the host version with the cached copy now (e.g. a "check for
  updates" button). MyLAN already does this after every (re)connection, so do not send it at start-up. Answered with
  `mylan:update-result`; if the version changed MyLAN refreshes the cache in the background and sends `mylan:app-updated`:
  ```javascript
  window.parent.postMessage({ type: "mylan:sync-update" }, "*");
  ```

### 5.2 Messages Sent by MyLAN to Child App:
* **`mylan:peer-connected`**: Notifies the embedded app that the P2P WebRTC DataChannel is open and operational.
* **`mylan:peer-disconnected`**: Notifies the embedded app that P2P connectivity was lost (prompting the app to enter offline/read-only mode).
* **`mylan:app-updated`**: The cached copy of the app was replaced with the host's new version (all files downloaded
  in the background). Answer `{ type: "mylan:app-updated-ack" }` to the parent within 5 s and reload when convenient;
  without the answer (or a reload) MyLAN considers the app stuck and reloads the iframe itself.
* **`mylan:update-result`** `{ changed }`: answer to `mylan:sync-update`: `true` updated (then `mylan:app-updated`),
  `false` already current, `null` host not reachable now.

---

## 6. Frontend Developer Best Practices

1. **Use Relative Paths**: Always use relative URLs (`/api/...` or `./api/...`) instead of hardcoding hostnames (`http://localhost:8080`).
2. **Detect the MyLAN Container**:
   ```javascript
   export function isInsideMyLAN() {
     return window.self !== window.top || window.location.pathname.includes("/session/");
   }
   ```
3. **Avoid Secondary Service Worker Registration**:
   When `isInsideMyLAN()` is true, avoid registering a local `/sw.js` (MyLAN already intercepts and caches your session via its own Service Worker).
4. **Shell Versioning**:
   Declare `update_check` in `/.well-known/mylan.json` (the endpoint and field that carry your frontend version) and
   handle `mylan:app-updated`. Do not compare against a version written by hand in your HTML: if it is not bumped with
   every release, the app asks for an update at every start (this caused a re-download loop before MyLAN 2026-10-04).

---

## 7. Dynamic Multi-PWA Installation & Standalone Mode

MyLAN enables each connected web application to be installed on mobile devices (Android/iOS) and desktop as an independent, standalone Progressive Web App:

1. **Dynamic Manifest Synthesis**: When an app is activated, `pwa-manifest.js` synthesizes a dedicated Web App Manifest (`manifest.json?app=<slug>`) populated with the app's real title, theme color, description and PNG icons (purpose `any`). MyLAN's own icons are listed only when the app has no usable icon, so Chrome never prefers them over the app's.
2. **Binary Icon Caching**: Because Chromium rejects `data:` URIs inside web app manifests, `pwa-icon.js` rasterizes the app icon (data URI or inline SVG) to 192x192 and 512x512 PNGs, stores them in CacheStorage and serves them through `./app-icon.png?app=<slug>&s=<size>&v=<version>`.
3. **Ordering & single link**: updates are queued by the viewer and applied in order: icons cached, then manifest cached, then the single `<link rel="manifest">` is swapped (stale updates are dropped). The manifest URL carries a version (`manifest.json?app=<slug>&v=<hash>`) so Chrome re-reads it whenever title or icon change.
4. **Service Worker Interception**: The outer Service Worker (`sw.js` + `sw-manifest.js`) intercepts and serves both `manifest.json?app=<slug>` and `app-icon.png?app=<slug>`.
5. **Borderless Fullscreen Execution**:
   - The manifest declares `display: "fullscreen"` and `display_override: ["fullscreen", "standalone"]` for 100% borderless presentation.
   - When the user launches the installed PWA from their home screen, the browser opens `/?app=<slug>` in standalone/fullscreen mode.
   - MyLAN suppresses its top navigation bar (`body.is-standalone .top-bar { display: none !important; }`), launching the child application immediately with zero wrapper UI. The viewer is sized on the dynamic viewport (`100dvh`, fallback `100vh`) so in browser mode on mobile the child app gets exactly the visible height and never ends under the browser's bottom bar; the page behind it stops scrolling (`html.mylan-viewer-open`).
   - The child application automatically reconnects to the host using the saved reconnect token.

