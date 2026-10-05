# MyLAN Integration Guide

This guide is for developers of self-hosted, local or LAN web apps and PWAs who want their app to be reachable
from anywhere through MyLAN. It explains what MyLAN does, what your host must implement, and what to expect.
Wire-level details (message formats, chunk framing, `postMessage` bridge) are in [APP_SPEC.md](APP_SPEC.md).

Throughout this guide, "Example App" is a placeholder for your application and `https://<user>.github.io/MyLAN/`
for wherever MyLAN is published.

---

## 1. The problems MyLAN solves

| Problem on a LAN app | What MyLAN does |
|---|---|
| No trusted HTTPS on `http://192.168.x.y` (no Service Worker, no install, no WebRTC/sensors/AudioWorklet in some browsers) | Serves the app from a static HTTPS origin (GitHub Pages) with a real certificate |
| Self-signed certificates need a root CA installed on every phone | Nothing to install on the phone |
| Reaching the home server from outside (4G/5G, another Wi-Fi) | Direct WebRTC P2P link to the host, no VPN, no cloud relay of app data |
| Installing the app as a PWA | Per-app installation: the installed icon opens your app directly, with its own name and icon |

MyLAN itself is static: HTML, CSS and ES modules, no build step, no backend.

---

## 2. Architecture at a glance

```
Phone browser (HTTPS origin: GitHub Pages)                    Your host (PC, NAS, Raspberry Pi...)
+-------------------------------------------+                 +------------------------------+
| MyLAN page (hub / portal / viewer)        |  WebRTC         | Example App server           |
|  +-------------------------------------+  |  DataChannels   |  + MyLAN host side (you):    |
|  | iframe  /session/<key>/  (your app) |  |<===============>|    - signaling listener      |
|  +-------------------------------------+  |  mylan-api      |    - WebRTC peer             |
|  Service Worker: /session/<key>/* -> P2P  |  mylan-media    |    - request bridge to HTTP  |
+-------------------------------------------+                 +------------------------------+
            |   encrypted offer/answer only (< 4 KB)                      |
            +----------------------> ntfy.sh topic <----------------------+
```

1. The host creates a one-time **invite code** (12 characters, shown as `XXXX-XXXX-XXXX`) and shares a link
   `https://<user>.github.io/MyLAN/#i=XXXXXXXXXXXX&p=2` (also accepted: `?i=`, `?code=`, `#code=`; `p=2` selects the
   invite protocol 2 of §5, a link without `p` uses protocol 1).
2. The phone opens the link; MyLAN creates a WebRTC offer, encrypts it with a key derived from the code and posts it
   to a signaling topic. The host polls the topic, asks its user to approve, and posts an encrypted answer.
3. The two DataChannels open directly between phone and host. From now on **no app data passes through any server**.
4. MyLAN downloads `index.html` plus the assets it references, caches them, and opens your app in an iframe under
   `/session/<key>/` (one key per saved app, see §4). Every request made by your app under `/session/<key>/` is
   intercepted by MyLAN's Service Worker and sent over the DataChannel to that app's host.

---

## 3. Registering your app (identity)

MyLAN discovers your app's identity right after the first P2P connection, in this order:

1. `GET /.well-known/mylan.json` (recommended)
2. `GET /manifest.json` (your normal W3C manifest)
3. The root HTML: `<title>`, `<meta name="description">`, `<link rel="icon">` / `apple-touch-icon`

Fields read by MyLAN (`src/loader/app-metadata.js`):

| Field | Use |
|---|---|
| `name` (or `short_name`) | Title in the Hub, tab title, installed PWA name |
| `description` | Hub card, installed PWA description |
| `theme_color` | Installed PWA theme color |
| `background_color` | Installed PWA splash-screen background |
| `icon` | One icon for the Hub and the tab: a path on your host, a `data:` URI or raw inline `<svg ...>` markup |
| `icons[]` | All of them (sizes and `purpose`) go into the installed PWA's manifest: declare 192 and 512 px, `any` and `maskable` (APP_SPEC §2 "Recommended icon set"). For the Hub, when `icon` is missing: first `.svg`, else a `192` size, else the first entry |
| `media_paths[]` | Optional path prefixes (each starting with `/`) to route over the `mylan-media` channel |
| `chunked_uploads` | `true` if your host accepts larger request bodies (JSON message over 64 KB, about 46 KB of body) sent as binary frames (APP_SPEC §4.1); without it such requests get a local `413` |
| `update_check` | Optional `{ "url": "/api/version", "field": "shell" }`: a GET path on your host (JSON) and the field holding the version of your frontend files. MyLAN compares it with the cached copy after each (re)connection; without it MyLAN compares a hash of your root HTML (§4 "Updates") |
| `runtime_cache` | Optional list of `GET` path prefixes (also under `/api/`) that MyLAN may keep for offline use, e.g. covers or thumbnails already seen (§4 "Runtime cache") |
| `version` | Informational |

Example (`/.well-known/mylan.json`, served by your host, no authentication required; MyLAN also requests it as a
light liveness check after a tab restore, §4):

```json
{
  "name": "Example App",
  "short_name": "Example",
  "description": "A self-hosted app reached through MyLAN",
  "version": "1.0.0",
  "theme_color": "#6366f1",
  "icon": "/icons/example-192.png",
  "media_paths": ["/files/", "/api/stream/"],
  "chunked_uploads": true,
  "update_check": { "url": "/api/version", "field": "shell" },
  "runtime_cache": [
    { "prefix": "/api/covers/", "strategy": "stale-while-revalidate", "keep_params": ["size", "v"],
      "version_param": "v" }
  ]
}
```

Icons referenced by path are fetched over the DataChannel (4 s timeout) and stored as `data:` URIs. Once the app is
running it can also update its title and icon at any time with the `mylan:register` message (APP_SPEC §5).

---

## 4. The HTTPS container and the viewer

* **Origin**: your app runs on MyLAN's HTTPS origin, inside `<iframe src="./session/<key>/">`. The key comes from
  the saved app's stable id (`src/loader/session-key.js`), not from its title or invite code. Each app has its own
  cache `mylan-session-v3:<key>`, its own copy of the initial page (`mylan_shell_html:<key>`) and its own Web Storage
  namespace; all of them are deleted when the app is removed from the Hub (`src/storage/app-cleanup.js`).
* **Service Worker** (`sw.js`): requests under `/session/<key>/` are answered from that app's cache when possible;
  everything else is forwarded to the MyLAN page (`src/loader/sw-bridge.js`), which sends it over the DataChannel and
  streams the response back. Only `GET` responses outside `/api/` are cached, plus the `GET` paths the app declares in
  `runtime_cache` (below); other `/api/` responses and other methods are never cached. Requests go only over the channel of that app's host: opening another saved app
  reconnects to its host, and the previous channel is closed.
* **Which tab relays** (`src/loader/sw-relay.js`, `sw-relay-probe.js`): with several MyLAN tabs open, the Service
  Worker asks each one whether it hosts the requesting frame (the frame learns its own client id at start-up),
  shows that app, or holds an open channel to its host, and uses the best answer. With one tab there is no question.
* **Request bodies** are read as bytes and reach your host byte-identical (JSON, text, `Blob`, files, `FormData`).
* **Storage namespace** (`src/loader/frame-storage-shim.js`, injected before your scripts): `localStorage` and
  `sessionStorage` see only your keys (stored as `mylan-app:<key>:<name>`), `clear()` clears only yours, and
  `caches.keys()` hides MyLAN's `mylan-*` caches. IndexedDB, your own cache names, cookies and Workers are **not**
  namespaced: use app-specific names. This avoids collisions and accidental reads; it is not a security boundary (§8).
* **HTML patching** (`src/loader/html-patcher.js`, `sandbox-bridge.js`): the root HTML gets a `<base href>` and a
  small script that rewrites root-absolute URLs (`/x`) used by `fetch`, `XMLHttpRequest`, `src`/`href` attributes,
  `img.src`, `audio/video.src` and `link.href` so they stay under `/session/<key>/`. Your own
  `navigator.serviceWorker.register` is replaced by a no-op (MyLAN's Service Worker already serves you). The patched root
  HTML is kept so the app opens instantly next time, even before the P2P link is back.
* **Initial download** (`src/loader/app-downloader.js`): `/`, then every `<link href>` and `<script src>` found in it,
  six at a time (`src/loader/app-updater.js`). Other files (dynamic imports, images, fonts) are fetched on first use and
  then cached.
* **Cache first**: a saved app always opens from its cache (`GET` outside `/api/`), before and independently of the P2P
  link. Requests that need the host wait for the channel only while a reconnection is in progress (at most 15 s); with
  the host off or no reconnection running they fail at once with `503`, so your app can show its offline state.
* **Automatic return after a pause** (`src/ui/viewer-watchdog.js`, `src/loader/channel-probe.js`): mobile browsers
  freeze or discard background tabs, and after a long pause the DataChannel is usually dead, or still `open` but no
  longer answered (the host lost the peer, the phone changed network). Whenever the page becomes visible again,
  resumes (`resume`, `pageshow` from the back/forward cache), gets the network back (`online`) or the app's channel
  closes, MyLAN checks the channel: no channel, or no answer within 4 s to a light `GET /.well-known/mylan.json` (any
  status counts as an answer), means it closes the dead channel (pending requests fail at once with `503` instead of
  hanging) and reconnects with the saved token. One attempt at a time; while the page stays visible and online, up to
  six more attempts follow after 1, 2, 5, 10, 20 and 30 s, then MyLAN waits for the next event (or for
  `mylan:request-reconnect`). A small "Reconnecting..." label (it/en) is shown above the app meanwhile. When the
  channel is back the frame receives `mylan:peer-connected`; nothing is reloaded. A page discarded by the browser is
  simply reloaded and reconnects as on any start. `mylan:request-reconnect` goes through the same check, so a channel
  that is open but mute is replaced too.
* **Runtime cache** (`src/loader/sw-runtime-cache.js`, `sw-runtime-store.js`, `runtime-rules.js`): images and other
  `GET` resources your app shows from `/api/` (covers, thumbnails, avatars) would be missing with the host off. Declare
  their prefixes in `runtime_cache` and MyLAN keeps the ones already seen in a per-app cache `mylan-runtime:<key>`
  (deleted with the app). Each rule: `prefix` (starts with `/`), `strategy` (`cache-first`, default;
  `stale-while-revalidate`: the saved copy at once, then a background check with `If-None-Match`; `network-first`: the
  host, the saved copy if it fails or takes longer than `timeout_ms`, default 4000), `max_entries` (optional cap, the
  oldest go first; absent = no fixed number, recommended), `max_entry_kb` (default 1024, at most 4096), `keep_params` (only these query parameters
  form the cache key) and `version_param` (a URL carrying it never changes, so it is served cache-first, and a new value
  replaces the copies of the same resource with other values). With the host unreachable a saved entry is answered at
  once (no wait for a reconnection); when the exact URL was never seen, another saved version of the same path is used
  if `version_param` is set; otherwise the request fails with `503` as before. At most 10 rules. A request with
  `Range` or `Cache-Control: no-cache` is not served from the cache first (no-cache: host first, saved copy if it fails).
  Rules are read at each install or update of the app, and once from the host for apps saved before this feature.
  **Space**: one copy per resource and `keep_params` combination (with `version_param` a new version replaces the old
  one), no default cap on the number of entries, and a quota guard (`src/loader/sw-runtime-quota.js`): only when the
  origin uses more than 80% of its storage quota the oldest runtime entries go (other apps first) until 70%; app files,
  IndexedDB and Web Storage are never evicted by MyLAN. MyLAN requests persistent storage (`navigator.storage.persist()`)
  when an app is installed or updated. **Removed resources**: when your host deletes something whose responses may be
  cached (e.g. an item and its cover), send `mylan:runtime-cache-drop` with the paths (APP_SPEC §5.1) and MyLAN deletes
  those entries of your app at once; without it they only go under quota pressure. Correct use: version the URLs of
  images that can change (`?v=<modification time>`), keep sizes/variants in `keep_params`, leave `max_entries` out
  unless you really need a cap, keep `max_entry_kb` small for thumbnails, never list per-user or changing JSON.
* **Viewer** (`src/ui/app-viewer.js`): full-screen iframe sized on the dynamic viewport (`100dvh`, fallback `100vh`)
  so it never ends under a mobile browser's bottom bar; the page behind it stops scrolling. The iframe is allowed
  `autoplay; fullscreen; microphone; camera`.
* **Updates** (`src/ui/viewer-updater.js`): after each (re)connection MyLAN reads your version (`update_check`, or a
  hash of `/`). If it changed, every file already in the app's cache is downloaded again in the background (six at a
  time) into a staging cache and copied over the live cache only when all succeeded: the app keeps working from the old
  copy meanwhile, and a failed update leaves it untouched. Then your frame receives `mylan:app-updated`: answer
  `mylan:app-updated-ack` and reload when it suits you (e.g. not during playback). Without the acknowledgement within
  5 s MyLAN assumes the app is stuck and reloads the iframe itself. If the channel is already open when the app is
  opened (e.g. from the Hub) and the version differs or is unknown, the update runs BEFORE the iframe loads, so old and
  new files are never mixed. `mylan:sync-update`
  asks for the same check at any time (e.g. a "check for updates" button) and is answered with
  `mylan:update-result` `{changed: true | false | null}` (`null`: host not reachable now). Never send it on every
  start-up: MyLAN already checks by itself.
* **Boot repair** (`src/ui/viewer-heal.js`): the script MyLAN injects in your page reports to MyLAN, once, any start-up
  failure in the first 10 s (uncaught script error, including module `SyntaxError`s such as "does not provide an export
  named", a `<script>` that fails to load, a failed dynamic `import()`) as `mylan:app-boot-error`. A cached copy that
  mixes files of two versions fails exactly like this. MyLAN then, once per app and per session, downloads a complete
  consistent copy from the host (every cached file plus the initial page, swapped in only if all arrive) and reloads the
  iframe. If the host cannot be reached, a banner above the app says so instead of leaving a dead page. Your app needs
  nothing for this; avoid uncaught errors at start-up that are not real failures, as they trigger one repair.

What your frontend should do:

1. Use relative or root-absolute paths, never hard-coded hosts (`http://192.168.1.10:8000`).
2. Put every dynamic endpoint under `/api/` so it is never served from cache; list in `runtime_cache` only the `/api/`
   resources that may be shown from a saved copy (images, thumbnails), never data that must be fresh.
3. Detect the container (`window.self !== window.top` or `location.pathname` contains `/session/`) and then skip your
   own Service Worker and any LAN-only discovery.
4. Use HTTP requests (or polling) instead of WebSockets to your host: WebSockets to MyLAN's origin are stubbed.
5. Listen for `mylan:peer-connected` / `mylan:peer-disconnected` to switch between online and offline behaviour, and
   send `mylan:request-reconnect` when you need the link back. After a tab restore you need nothing else: MyLAN
   reconnects by itself and then sends `mylan:peer-connected` (re-check your host then, e.g. restart polling).

---

## 5. What the host must implement

MyLAN ships only the browser side. Your host needs a small companion (any language with a WebRTC stack, e.g.
`aiortc` for Python, `node-datachannel` or `werift` for Node, `pion` for Go):

1. **Invite code**: 12 random characters `[A-Z0-9]`. Normalization: strip non-alphanumerics, upper-case.
2. **Invite keys and topics (protocol 2, use this one)**:
   - `master = PBKDF2-HMAC-SHA256(normalized code, salt "MyLAN-Remote-V2-Invite", 200000 iterations, 32 bytes)`;
   - `HKDF-SHA256(master, salt "MyLAN-Remote-V2-HKDF", info, length)` with info `v2-offer` (32 bytes: AES-256-GCM
     key of the offer, browser -> host), `v2-answer` (32 bytes: key of the answer or refusal, host -> browser),
     `v2-topic-offer` and `v2-topic-answer` (16 bytes each);
   - topics `mylan2-offer-<hex of the 16 bytes>` and `mylan2-answer-<hex>`.
   Compute it once per invite, off your event loop (about 30-70 ms on a PC). Share links with `p=2` (`#i=CODE&p=2`):
   MyLAN uses protocol 2 for them and for codes typed by hand. Listen **only** on the protocol 2 topics: also
   listening on protocol 1 topics would give an observer the fast check that protocol 2 removes (below).
   Test vector: code `K7QM-4XRD-P2HW` -> master `0be70dfb...c8794d`, offer topic
   `mylan2-offer-08c80141ca1c0cd6723becc801bd044a`, answer topic `mylan2-answer-3bb82ff2fdfea75b11439933af7b0f56`
   (full vector in `Tools/test_invite_v2.mjs`).
   *Why*: the code has 60 bits. In protocol 1 the topic was a single SHA-256 of the code, so anyone who sees topic
   names on the relay could try every code offline cheaply and then open the answer (which carries the long-lived
   reconnect token). Protocol 2 makes each guess cost 200000 PBKDF2 rounds and never reveals the code in a topic.
3. **Protocol 1 (older hosts, links without `p`)**: key = HKDF-SHA256 over the normalized code, salt
   `MyLAN-Remote-V1-Salt`, info `handshake` (one key for both directions); topics `mylan-<prefix>-` + first 20 hex
   chars of `SHA-256("ntfy-topic-<prefix>-<normalized code>")` with prefixes `offer` / `answer`. MyLAN still speaks
   it for such links. **Return visits** keep this derivation with the reconnect token (256 random bits, so no
   guessing) in place of the code: prefixes `reconnect-offer` / `reconnect-answer`; tokens longer than 16
   characters are not normalized.
4. **Envelope**: base64url (no padding) of `IV (12 bytes) || AES-GCM ciphertext+tag` of a JSON object; keep it under 4 KB.
5. **Signaling relay**: `POST https://ntfy.sh/<topic>` with the envelope as body; read with
   `GET https://ntfy.sh/<topic>/json?since=...` (MyLAN keeps this stream open, so your answer is read as soon as it is
   published; `poll=1` also works for the host). Pause between failed reads: ntfy answers `429` to clients that retry
   without delay.
6. **Pairing**: read the offer `{type:"offer", device_id, sdp, meta}`, show the user who is asking (`meta` carries
   OS, browser, device type, screen), and on approval answer `{type:"answer", sdp, reconnect_token, ice?}`; on refusal answer
   `{type:"rejected"}` (any answer without `sdp` is treated as rejected). The browser waits up to 180 s for approval.
7. **Return visits**: listen on the `reconnect-offer` topic of each stored token; offers carry a `nonce` that you must
   echo in the answer and should reject when repeated (replay protection). The browser waits 20 s for the answer.
   Optional `ice` in both answers: see §6 (send it only if you run your own TURN).
8. **DataChannels**: the browser opens `mylan-api` and `mylan-media` (both reliable, ordered). Answer each request on
   the channel it arrived on, using the format in APP_SPEC §4; honour `{id, type:"abort"}` messages.
9. **Bridge**: map each request (`method`, `path`, `headers`, `body`) to your HTTP app and stream the response
   back in chunks of at most 64 KB. `body` is the base64 of the exact request bytes: decode it to bytes, not to text.
   Answer every request: MyLAN fails a request with `504` after 130 s without any message for it (start or chunk)
   and sends `{id, type:"abort"}`; a good host answers within 120 s (even just with an error status). Serve a
   bounded number of requests per channel at once and queue the rest (MyLAN may send hundreds together on the
   first start).
   Bodies whose JSON message would exceed 64 KB (about 46 KB of body) arrive only if you declare
   `"chunked_uploads": true`: the JSON then carries `body: ""`,
   `body_chunked: true`, `body_size: N`, followed by binary frames `0x42 | idLen | more | id | bytes` (up to 60 KB of
   payload each); handle the request after the frame with `more = 0`. Without the flag MyLAN answers `413` locally
   and nothing is sent (APP_SPEC §4.1). Treat `x-device-id` as an identifier, not as proof of identity: authorize with
   the reconnect token / your own session.
10. **WebSockets (optional)**: declare `"websocket": true` and handle the `ws-open` / `ws-msg` / `ws-close` messages
   of APP_SPEC §4.4 on the same channel: run your WebSocket handler with the identity of the peer (as for HTTP),
   answer `ws-accept` or `ws-close`, split long messages with `more`, apply backpressure (`bufferedAmount`) and close
   every connection of a channel when it closes. Allow only your WebSocket paths and cap the connections and the
   message size per channel.

---

## 6. The P2P link: STUN by default, optional host TURN

* ICE servers (`src/webrtc/ice-config.js`): public STUN by default. MyLAN deliberately ships **no TURN relay**: free
  ones are capped and paid ones cost money; with a third-party TURN your data would also flow through that party.
* **Optional host-provided ICE servers.** A host app may add `ice` to its encrypted answers (pairing and return):
  an array in the browser's `RTCIceServer` format, e.g.
  `[{"urls": ["turn:turn.example.org:3478?transport=udp"], "username": "u", "credential": "p"}]`. MyLAN keeps only
  `stun:`, `turn:` and `turns:` URLs, merges them with its default STUN servers, stores them for that app on the
  device (MyLAN's own `localStorage` key, not visible through the app's storage namespace) and uses them from the
  next connection on (return visits included). An answer without `ice` removes them. Send it only if you run your
  own TURN (e.g. coturn or eturnal) or one you trust; the credentials travel only inside the encrypted envelope.
  Keep the envelope under 4 KB. Even before the browser knows your TURN, a TURN on the host side alone usually
  connects: the host's `relay` candidate in its answer is reachable from almost any guest network.
* The browser gathers host and server-reflexive candidates and sends a complete offer (no trickle ICE) when gathering
  ends, about 400 ms after the first `srflx` candidate, or after 3 s at most. With a host-provided TURN it waits for
  the first `relay` candidate instead (+600 ms, at most 6 s).
* DataChannels must open within 30 s (first pairing) or 15 s (reconnect); otherwise the portal says that the two
  networks do not allow a direct connection.

When does a direct link work?

| Phone network | Home network | Result |
|---|---|---|
| Wi-Fi / home router (cone NAT) | Public IPv4, any router | Usually works (UDP hole punching) |
| 4G/5G with CGNAT (often symmetric NAT) | Public IPv4, ordinary NAT | Often fails with random host ports; works if the host exposes a fixed UDP port (below) |
| 4G/5G with CGNAT | Home also behind CGNAT, no IPv6 | Fails: no side is reachable |
| Any network with working IPv6 on both sides | IPv6 | Usually works, if your WebRTC stack gathers IPv6 candidates |
| Networks that block UDP (some corporate/hotel Wi-Fi) | any | Fails, unless the host provides a TURN over TCP/TLS (`turns:`) |

**Optional fixed UDP port on the host.** A direct link only needs one reachable side. If the home line has a public
IPv4, the host can bind its WebRTC stack to a fixed UDP port (or a small range, one per concurrent guest), open it on
the router **only while an invite is pending or a guest is connected** (UPnP-IGD, NAT-PMP/PCP, or a manual forward)
and advertise the public `ip:port` as a candidate in its answer. Close the mapping after pairing or when the guest
leaves. This is the host's choice and is outside MyLAN: MyLAN itself never opens ports or talks to routers.

---

## 7. Installing one app as its own PWA

The same MyLAN origin can install either the **MyLAN hub** (default `manifest.json`) or **one specific app**:

1. When the viewer opens an app, `src/ui/pwa-manifest.js` builds a manifest for it: the app's name, description,
   theme color and icon; `start_url` and `id` = `https://<user>.github.io/MyLAN/?app=<slug>` (slug from the title);
   `display: "fullscreen"` with `display_override: ["fullscreen", "standalone"]`.
2. **Icon caching** (`src/ui/pwa-icon.js`): Chromium rejects `data:` icons in manifests, so the app icon is rasterized
   to 192 and 512 px PNGs, stored in CacheStorage and served by the Service Worker at
   `app-icon.png?app=<slug>&s=<size>&v=<version>`. MyLAN's own icons are used only if the app has none.
3. **Versioned URL, single link**: the manifest is stored at `manifest.json?app=<slug>&v=<hash>` (hash of title,
   icon, color, description) and the page keeps exactly one `<link rel="manifest">`, swapped only after icons and
   manifest are cached. Changing title or icon changes the URL, so the browser re-reads it.
4. The user installs from the browser menu while the app is open. The installed icon opens `?app=<slug>`, MyLAN hides
   its own top bar (`body.is-standalone`) and starts the app immediately, reconnecting with the saved token.

The **internal link** `https://<user>.github.io/MyLAN/?app=<slug>` opens a saved app directly on a device that has
already paired with it (the app list lives in that browser's `localStorage`). Closing the app restores MyLAN's own
manifest, so the hub can still be installed separately.

---

## 8. Security model

> **Disclaimer.** Apps opened through one MyLAN deployment share one origin, so a malicious app could read the other
> apps' data and tokens on that device (§8.1). MyLAN is a tool for developers to test and reach **their own** apps:
> it is assumed that the developer connects only apps they wrote or trust. No responsibility is taken for
> third-party apps opened through MyLAN.

* **Signaling is zero-knowledge**: ntfy.sh only sees encrypted envelopes on unguessable topics derived from the code;
  the code and the keys never leave the two devices. Only the SDP (IP candidates) travels in the envelope.
* **The link is end-to-end encrypted** by WebRTC (DTLS-SRTP/SCTP); no server relays app data.
* **Approval on the host**: an invite code alone does not grant access; the host's user approves each device.
  Codes should expire (e.g. 15 minutes) and be single use.
* **Reconnect token**: issued by the host on approval, stored in the browser's `localStorage`. The host should store
  only a hash and allow revoking it.
* **Your host still enforces authorization**: treat every DataChannel request like an HTTP request from the internet.
* **TURN credentials** (optional `ice`, §6) are readable by anyone who controls the guest device or another app on
  the same origin: use credentials limited to your TURN (ideally short-lived) and never log them on the host.

### 8.1 Isolation between apps (same origin)

All apps opened through one MyLAN deployment run on its origin and share its Service Worker. What MyLAN does:
a separate `/session/<key>/` space, cache and initial page per app; requests routed only to that app's host; a
per-app Web Storage namespace that hides MyLAN's keys (Hub list, reconnect tokens) and the other apps' keys.
What it **cannot** do on one origin: a malicious app can bypass the namespace through `top.localStorage`,
`top.document`, a fresh `about:blank` iframe or IndexedDB, and read other apps' data and tokens on that device.
Connect only to hosts you trust.

| Option | Isolation | Apps work? |
|---|---|---|
| `sandbox` without `allow-same-origin` | real | no (no Service Worker, storage errors) |
| `sandbox` with `allow-same-origin` | none | yes |
| Tokens only in the parent, reached via `postMessage` | none | yes |
| Encryption with a non-extractable key | none | yes |
| Per-app namespace (**current**) | accidental reads only | yes |
| One deploy per app on a separate origin | real | yes |

All project sites of one GitHub account (`<user>.github.io/A/` and `/B/`) share **one** origin, so a separate origin
needs a custom domain or another GitHub user/organization.

### 8.2 Evaluated option: one origin per app (not adopted)

**Not adopted: the owner decided not to buy a domain (2026-10-04).** The analysis below is kept for anyone who
publishes their own MyLAN on a domain they own.

* **Layout**: the portal on `mylan.<domain>`, each saved app's iframe on `<appkey>.<domain>`, from one static deploy
  behind a wildcard DNS record (e.g. a Cloudflare Worker serving the static files on the route `*.<domain>/*`;
  GitHub Pages has no wildcard custom domains).
* **Why it works**: subdomains of the same registrable domain are *same-site*, so the browser does not partition the
  iframe's storage as third-party; each frame keeps its own Service Worker and storage on its own origin.
* **Who holds what**: the parent (portal) keeps all tokens, keys and the DataChannels; each frame talks to it only
  via `postMessage` / `MessageChannel`, and the parent routes a frame's requests only to that app's host.
* **Sandbox**: `allow-same-origin` is safe **only** because the frame's origin differs from the portal's; still no
  `allow-top-navigation`.
* **Cost**: a domain, about 1–12 €/year.

| Variant | Isolation | Storage / Service Worker in the frame | Cost | Limits |
|---|---|---|---|---|
| Subdomains of a custom domain | real (one origin per app) | own, not partitioned (same-site) | domain ~1–12 €/year | needs wildcard DNS + a host with wildcard routes |
| N fixed "slot" origins (separate GitHub orgs, `<org>.github.io`) | real (one origin per slot) | partitioned third-party storage (`github.io` is on the Public Suffix List, so each org is its own site); Service Worker in a third-party iframe: Chrome/Firefox yes (partitioned), Safari to verify [?] | free | at most N apps; a slot reused for another app must be wiped; N organizations to maintain |

---

## 9. Known limits

| Limit | Effect | Workaround |
|---|---|---|
| No TURN shipped | Some network pairs (CGNAT on both sides, UDP blocked) cannot connect | Host-side fixed UDP port during the invite; another network; IPv6; a host-provided TURN (`ice`, §6) |
| ntfy.sh dependency for signaling | If ntfy.sh is down or rate-limits (HTTP 429), pairing waits or fails | Retry later; reconnect handles 429 with back-off |
| Apps share one origin | A malicious app can read other apps' data and tokens through `top.localStorage`, `top.document`, `about:blank` or IndexedDB (§8.1) | Connect only to trusted hosts; real isolation needs one origin per app (§8.2) |
| Request bodies over about 46 KB (JSON message over 64 KB) | Sent only if the app declares `"chunked_uploads": true` and the host reads binary frames; otherwise a local `413` | Declare the flag and support chunked bodies (§5.9), or upload in smaller requests |
| Invite code of 60 bits | With protocol 2 (§5) each guess costs 200000 PBKDF2 rounds and topic names do not reveal the code, but an observer of the relay with a lot of computing power could still try codes during the invite's life | Keep invites short-lived and single-use; return visits use 256-bit tokens |
| Invite links of older hosts (no `p`) | They use protocol 1, cheap to guess offline for an observer of the relay | Update the host to protocol 2 (links with `p=2`) |
| Requests silent for 130 s | Failed with `504` and aborted on the host (APP_SPEC §4.1) | Answer within 120 s; long-polling must return before that |
| Storage not namespaced everywhere | IndexedDB, your own cache names, cookies and Workers are shared by all apps on the origin | Use app-specific database and cache names |
| Data from older versions | Versions with one shared space are migrated once at first start: non-MyLAN keys are **copied** into each saved app's namespace; the originals are kept (the origin may host other sites of the same account) | Nothing to do; old keys can be cleared by the user |
| WebSockets only on request | WebSockets to MyLAN's origin travel on the DataChannel only for apps that declare `"websocket": true` (APP_SPEC §4.4); otherwise they never open. A lost channel closes them with `1006` and messages sent meanwhile are lost | Declare the flag and reconnect on `close`, or use HTTP polling over `/api/` |
| `/api/` responses are not kept offline unless declared | Images served from `/api/` break with the host off | Declare their prefixes in `runtime_cache` (§4) |
| Non-`/api/` responses are cached | Dynamic content outside `/api/` can be stale | Keep dynamic endpoints under `/api/`, or send the request with a `Cache-Control: no-cache` header |
| Root-absolute ES module imports | `import "/x.js"` is not rewritten | Use relative imports |
| iOS install | Safari ignores dynamic manifests for name/icon in many versions | Expect the page title and default icon on iOS |
| Apps are per browser | The Hub list and tokens live in `localStorage` | Pair again after clearing site data or on a new browser |
