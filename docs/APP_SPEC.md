# MyLAN Application Integration Specification

This specification defines the standard discovery protocol, DataChannel wire format, and container bridge interfaces for web applications connecting through the MyLAN WebRTC P2P gateway.

---

## 1. Overview & Sandboxing

MyLAN acts as a trusted HTTPS trampoline and peer-to-peer sandbox:
* The remote web application is executed inside an isolated sandbox iframe (`/session/`).
* MyLAN's outer Service Worker (`sw.js`) intercepts all requests under `/session/` and routes them directly over WebRTC DataChannels to the host machine.
* Static assets (HTML, CSS, JS modules) are automatically discovered and cached into `mylan-session-cache-v1` for instant offline loading and hard-refresh resilience.

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
  "icons": [
    {
      "src": "/src/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    }
  ]
}
```

### Supported Icon Formats:
* **Binary Images**: PNG, WebP, JPEG, SVG served over DataChannel (automatically converted to data URIs).
* **Vector SVG Strings**: Raw inline SVG markup `<svg ...>...</svg>` is natively supported for crisp, resolution-independent rendering in the Hub and dynamic tab favicons.

---

## 3. Dual DataChannel Multiplexing

To guarantee responsive UI interactions during heavy media transfers, MyLAN establishes two multiplexed WebRTC DataChannels:

| Channel Label | Reliability | Ordering | Purpose |
|---|---|---|---|
| `mylan-api` | Reliable | Ordered | Standard REST/RPC requests (`GET`, `POST`, `PUT`, `DELETE`), JSON APIs, manifests, and scripts. |
| `mylan-media` | Reliable | Ordered | High-throughput streaming (`/stream`, `/cover`, video chunks, heavy binary files). |

Channels are negotiated with a default timeout of 30 seconds to support high-latency cellular networks (4G/5G). ICE gathering explicitly waits for STUN/TURN relay candidates (`typ relay`) to punch through Carrier-Grade NAT (CGNAT) and symmetric NATs.

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

---

## 5. Container Bridge Protocol (`postMessage`)

Applications running inside the sandbox iframe can communicate with the MyLAN parent container using `window.parent.postMessage`.

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
* **`mylan:sync-update`**: Informs MyLAN that a new version is available on the host to trigger a bundle re-sync and page reload:
  ```javascript
  window.parent.postMessage({ type: "mylan:sync-update" }, "*");
  ```

### 5.2 Messages Sent by MyLAN to Child App:
* **`mylan:peer-connected`**: Notifies the embedded app that the P2P WebRTC DataChannel is open and operational.
* **`mylan:peer-disconnected`**: Notifies the embedded app that P2P connectivity was lost (prompting the app to enter offline/read-only mode).

---

## 6. Frontend Developer Best Practices

1. **Use Relative Paths**: Always use relative URLs (`/api/...` or `./api/...`) instead of hardcoding hostnames (`http://localhost:8080`).
2. **Detect MyLAN Sandbox**:
   ```javascript
   export function isInsideMyLAN() {
     return window.self !== window.top || window.location.pathname.includes("/session/");
   }
   ```
3. **Avoid Secondary Service Worker Registration**:
   When `isInsideMyLAN()` is true, avoid registering a local `/sw.js` (MyLAN already intercepts and caches your session via its own Service Worker).
4. **Shell Versioning**:
   Expose your shell version on your root HTML element (e.g. `<html data-shell="v1.0.0">`) to easily compare with `/api/version` and trigger `mylan:sync-update` on updates.

---

## 7. Dynamic Multi-PWA Installation & Standalone Mode

MyLAN enables each connected web application to be installed on mobile devices (Android/iOS) and desktop as an independent, standalone Progressive Web App:

1. **Dynamic Manifest Synthesis**: When an app is activated, `pwa-manifest.js` synthesizes a dedicated Web App Manifest (`manifest.json?app=<slug>`) populated with the app's real title, theme color, description, and high-resolution maskable PNG icon.
2. **Binary Icon Caching**: Because Chromium rejects `data:` URIs inside web app manifests, MyLAN caches data URI icons into a binary PNG cache and serves them through `./app-icon.png?app=<slug>`.
3. **Service Worker Interception**: The outer Service Worker (`sw.js` + `sw-manifest.js`) intercepts and serves both `manifest.json?app=<slug>` and `app-icon.png?app=<slug>`.
4. **Borderless Fullscreen Execution**:
   - The manifest declares `display: "fullscreen"` and `display_override: ["fullscreen", "standalone"]` for 100% borderless presentation.
   - When the user launches the installed PWA from their home screen, the browser opens `/?app=<slug>` in standalone/fullscreen mode.
   - MyLAN suppresses its top navigation bar (`body.is-standalone .top-bar { display: none !important; }`), launching the child application immediately at 100vw x 100vh with zero wrapper UI.
   - The child application automatically reconnects to the host using the saved reconnect token.

