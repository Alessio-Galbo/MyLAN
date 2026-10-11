# MyLAN Host

**MyLAN Host** è un solo programma sul PC che parla con il telefono (signaling + WebRTC) e inoltra le richieste di
ogni app alla sua **porta locale**. Le app non contengono codice MyLAN: dichiarano solo chi sono in
`/.well-known/mylan.json` (come già oggi, [INTEGRATION.md §3](INTEGRATION.md)) e restano server HTTP normali.

Decisione dell'utente del 2026-10-11: prima ogni app doveva incorporare il «lato host» (peer WebRTC + ponte verso
HTTP), come fa FaMiLAN; d'ora in poi la via consigliata è registrare l'app nel Host. Incorporare resta possibile
(INTEGRATION.md §5), per chi distribuisce l'app senza il Host.

---

## 1. Architecture

```
Phone (MyLAN on GitHub Pages)                     PC
+----------------------------+   WebRTC      +--------------------------------+      HTTP (loopback/LAN)
| saved app "AI-hub"  -------+-- peer A -----+-> MyLAN Host (python -m host)  +----> http://127.0.0.1:<hub port>
| saved app "FaMiLAN" -------+-- peer B -----+->   one process, N peers       +----> http://127.0.0.1:<app port>
+----------------------------+               +--------------------------------+
        \___ encrypted offer/answer only ___ ntfy.sh ___/
```

* **No phone-side change.** For the phone each app is still a separate host: one invite, one reconnect token, one
  peer per saved app. The Host simply answers all of them from one process; every pairing is bound to **one app**.
  A phone paired with app A has no path to app B (its peer only forwards to A's base URL).
* **Both MyLAN modes keep working** because nothing changes on the phone: an app installed through MyLAN as its own
  PWA (MyLAN only a carrier, INTEGRATION §7) and an app opened inside the MyLAN hub among the others.
* **No port is opened on the PC.** The Host only makes outgoing connections (relay, STUN, the local apps).

| File | Role |
|---|---|
| `host/cli.py`, `cli_apps.py` | commands |
| `host/daemon.py` | `run`: one listener per live invite and per approved pairing, re-reads `data/` every 2 s |
| `host/pairing.py`, `returns.py` | first pairing (protocol 2) and return visits (nonce) |
| `host/peers.py`, `channel.py`, `wire.py` | aiortc peers, per-channel queue/limits/aborts/chunked uploads |
| `host/forward.py`, `headers.py`, `frames.py` | HTTP forwarding, header rules, response frames |
| `host/apps.py`, `descriptor.py`, `invites.py`, `devices.py`, `pending.py`, `store.py` | state in `data/` |
| `host/crypto.py`, `relay.py` | envelopes, key/topic derivation, ntfy client |

Pairing, return and channel logic are adapted from FaMiLAN's host (`backend/app/services/remote/`), copied with
attribution in each file, not imported.

## 2. Install and run

```
py -3.13 -m venv host/.venv
host/.venv/Scripts/python -m pip install -r host/requirements.txt     # aiortc, aiohttp (~108 MB, PyAV included)
host/.venv/Scripts/python -m host run                                  # from the MyLAN repo root
```

Texts of the CLI: `host/locales/it.json` / `en.json` (`MYLAN_HOST_LANG`, default `it`).

## 3. Configuration (`host/data/`, never committed)

The state lives in `MYLAN_HOST_DIR` (default `host/data/`, in `.gitignore`):

| File | Content |
|---|---|
| `apps.json` | `{id: {id, name, base_url, protected, secret, secret_header, device_header, descriptor}}` |
| `config.json` | optional: `portal_url` (where MyLAN is published), `relay_url` (default `https://ntfy.sh`), `ice_servers` (STUN/TURN URLs; default Google STUN) |
| `invites.json` | live invites: code -> app, expiry, used |
| `devices.json` + `host.key` | approved pairings: app, display data, hash of the reconnect token + copy sealed with `host.key` |
| `pending/<CODE>.json` / `.decision` | a phone waiting for approval / the PC user's answer |

## 4. Adding an app

```
python -m host apps add http://127.0.0.1:8123 [--id hub] [--protected] [--secret-stdin]
                       [--secret-header X-Hub-Bridge] [--device-header X-Hub-Device]
python -m host apps list          # never prints secrets
python -m host apps remove <id>
```

`add` reads `<base>/.well-known/mylan.json` (fixed path, no redirects, 5 s, 256 KB) and keeps the name and a few
fields; the phone reads the full descriptor through the channel as before. The id comes from `short_name`/`name`
(or `--id`). A per-app **secret** is generated and printed **once** (or read from stdin with `--secret-stdin`, when
the app generates its own). Running `add` again updates the entry and keeps the secret.

## 5. Invite and approval

```
python -m host invite <app>        # code XXXX-XXXX-XXXX + link <portal>/#i=CODE&p=2 (protocol 2), 15 minutes, single use
python -m host pending             # who is asking (OS, browser, device type, srflx IP from the SDP)
python -m host approve <code>      # or: reject <code>
python -m host devices [revoke <id>]
```

The running Host prints a line when an offer arrives; approval is prompt-free (a file per request), so a UI (e.g.
the AI-hub dashboard) can call `approve`/`reject`. The phone waits 180 s. A refused invite is spent. On approval the
Host picks the device id (`mh_<hex>`, never the phone's), stores the pairing, answers with SDP + reconnect token and
starts listening for return visits. `devices revoke` stops the listener and closes the open peer within 2 s.

## 6. Forwarding

Each request of the DataChannel (APP_SPEC §4.1) becomes one HTTP request to `base_url + path` (query included,
unchanged encoding):

* bodies are byte-identical both ways: no automatic decompression (`content-encoding` passes through), no redirects
  followed, no cookie jar; responses are streamed in JSON chunks on `mylan-api` and binary `0x42` frames on
  `mylan-media`, with backpressure;
* `chunked_uploads` (binary frames, up to 256 MB) is supported;
* limits per channel: 16 requests at once, 1024 queued (beyond: `429`), aborts honoured, everything stopped when the
  channel closes;
* errors (JSON `{"detail": reason}` + header `x-mylan-host-reason`): unknown/removed app `404 mylan_host_unknown_app`,
  app not reachable `503 mylan_host_app_down`, no response start within 120 s `504 mylan_host_app_timeout`, bad
  method `405`, bad path (`//...` included) `400`, headers over 64 / 16 KB `431`;
* **not yet**: the WebSocket tunnel (APP_SPEC §4.4; `ws-open` is refused with `ws-close 1008`), the fixed UDP port
  / UPnP of INTEGRATION §6 and `ice` in the answers (TURN). Apps that need them keep their embedded host for now.

## 7. Security contract (what the app sees)

Requests from the Host come from `127.0.0.1` but are **remote**: an app must never treat them as local access.

| Header (default name) | Value | Note |
|---|---|---|
| `X-MyLAN-Host` | the app's secret | per app; name configurable (`secret_header`) |
| `X-MyLAN-Device` | Host-chosen device id (`mh_<hex>`) | one per (phone, app) pairing; name configurable (`device_header`) |
| `X-MyLAN-Protected` | `1` or `0` | the app's `protected` flag |

* Any copy of these headers sent by the phone is **removed** (configured names and every `x-mylan-host*`,
  `x-mylan-device*`, `x-mylan-protected*`), as are `Host`, `Forwarded`, `X-Forwarded-*`, `X-Real-IP`, hop-by-hop
  headers and `Content-Length`; then the Host sets its own values. A phone cannot forge them.
* **The app verifies** the secret with a constant-time comparison (it may store only its SHA-256) and rejects a
  request whose header is present but wrong. A request without the header is a real local request.
* `protected: true` means: this app must ask for its own pairing/login also for Host requests (e.g. AI-hub, which
  controls the PC). The Host only passes the flag; the app enforces it.
* **What stays in the app**: its own authentication and authorization, its users and sessions. The Host only says
  "this came through MyLAN, from pairing X". The app also keeps serving `/.well-known/mylan.json` without
  authentication.

Example check in an app (Python):

```python
import hashlib, hmac
def via_mylan_host(headers, secret_sha256: str) -> bool | None:
    """None = local request, True = valid Host request, False = forged (reject with 401)."""
    got = headers.get("X-MyLAN-Host")
    if got is None:
        return None
    return hmac.compare_digest(hashlib.sha256(got.encode()).hexdigest(), secret_sha256)
```

## 8. Tests

`host/.venv/Scripts/python -m unittest discover -s host/tests -t .` (from the repo root): crypto against the fixed
vector of `Tools/test_invite_v2.mjs`, forwarding against a fake local app (byte-identical bodies, header injection
and stripping, custom header names, protected flag, 404/503, chunked upload, bad requests), CLI on an isolated data
dir, and an end-to-end pairing with real aiortc peers on the PC and an in-memory relay (approve, request, return
visit with nonce, refused invite).
