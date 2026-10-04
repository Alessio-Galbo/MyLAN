# Changelog

All notable changes to MyLAN. The git history was reset to a single "Initial commit" on 2026-10-04.

## [Unreleased]

## [cc7875c] - 2026-10-04 - Atomic updates with content-hash versioned modules

### Fixed
- After a publish on GitHub Pages a browser could run old and new MyLAN modules together (Pages lets files be cached
  for 10 minutes) and break with "does not provide an export named ...". Updates are now atomic: every module,
  stylesheet and text file is loaded as `?v=<version>`, and `index.html` starts `src/boot.js`, which reads
  `version.json` without cache and loads only that version's modules (stylesheets of an old cached `index.html` follow
  it), so a page always runs one consistent version. The Service Worker's `importScripts` carry their own version, so
  it is reinstalled only when its code changes.

### Added
- `node Tools/stamp.mjs`: computes the version as a hash of the published files and writes all the stamps and
  `version.json` (no manual bumps); `--check` fails when a stamp is missing or stale. Run it before every publish
  (README, "Publishing").
- `node Tools/test_atomic_update.mjs`: headless proof with an old cached deploy and a new one on the same address
  (old `index.html` still cached, one module already expired): the new version starts with no errors and every module
  carries the new stamp; `--no-stamp` reproduces the old failure.

## [17f4939] - 2026-10-04 - Reconnect restored tabs and cache declared app resources

### Added
- Optional `runtime_cache` rules in the app's `/.well-known/mylan.json`: `GET` resources the app shows from `/api/`
  (covers, thumbnails) are kept in a per-app cache `mylan-runtime:<key>` (strategies `cache-first`,
  `stale-while-revalidate`, `network-first`; optional `max_entries`, `max_entry_kb`, `keep_params`, `version_param`) and served
  at once when the host is unreachable. Undeclared `/api/` responses are still never cached; the cache is removed with
  the app. Apps saved earlier read their rules once at the next connection.

### Changed
- `runtime_cache`: `max_entries` is now an optional cap (no default 200, no upper limit of 5000); without it entries
  are limited only by a quota guard (`src/loader/sw-runtime-quota.js`): when the origin uses more than 80% of its
  storage quota the oldest runtime entries are removed (other apps first) until 70%, never app files, IndexedDB or
  Web Storage. Test `node Tools/test_runtime_cache.mjs`.

### Added
- `mylan:runtime-cache-drop` `{ paths }`: an app tells MyLAN that resources were removed on its host; their saved
  copies are deleted from that app's runtime cache only (paths covered by its rules).
- MyLAN asks the browser for persistent storage (`navigator.storage.persist()`) when an app is installed or updated,
  so the browser does not clear saved apps and their offline data when the device is low on space.

### Fixed
- With the host off, images an app had already shown from `/api/` (e.g. covers) were broken: they were never cached.

### Fixed
- After restoring a tab that the phone had put in the background (frozen tab, back/forward cache, changed network)
  the app did not reconnect by itself: only a page refresh brought the host back. A channel still `open` but no
  longer answered by the host was even taken as alive, and requests on it hung forever. MyLAN now checks the app's
  channel whenever the page becomes visible, resumes, gets the network back or the channel closes (no channel, or no
  answer within 4 s to `GET /.well-known/mylan.json`), closes a dead one and reconnects with the saved token: one
  attempt at a time, up to six retries after 1-30 s while the page is visible and online, a "Reconnecting..." label
  (it/en) above the app meanwhile, then `mylan:peer-connected` to the app, without reloading it
  (`src/ui/viewer-watchdog.js`, `src/loader/channel-probe.js`).
- Requests in flight on a DataChannel that closes now fail at once (`503` to the app) instead of hanging.

### Changed
- `mylan:request-reconnect` goes through the same liveness check, so an open but mute channel is replaced too.
- The peer connection of a reconnection is closed when its channel closes (no orphan peers); the waits for channel
  opening moved to `src/webrtc/channel-wait.js`.

## [77ec8c0] - 2026-10-04 - Repair apps that fail to start from a mixed cache

### Fixed
- An app whose cached copy mixed files of two versions died at start (e.g. "does not provide an export named ...") and
  stayed dead. MyLAN now repairs it by itself: the injected script reports start-up failures (`mylan:app-boot-error`,
  first 10 s), and MyLAN downloads a complete consistent copy from the host once per session and reloads the iframe;
  with the host unreachable a banner explains it (it/en). Devices that used earlier versions recover just by opening
  the app, with no removal from the Hub and no clearing of site data.

### Changed
- With the channel already open, an app whose version differs or is unknown (caches made by earlier MyLAN versions)
  is updated before the iframe loads, so old and new files are never mixed.
- After `mylan:app-updated` MyLAN waits 5 s for `mylan:app-updated-ack` (or a reload); a stuck app is reloaded.

## [de94c18] - 2026-10-04 - Cache-first apps, background updates and faster signaling

### Fixed
- An app that sent `mylan:sync-update` at every start got stuck in a loop: MyLAN wiped its cache, re-downloaded it and
  reloaded the iframe each time (very slow app, incomplete UI). The update no longer wipes the cache nor reloads the
  iframe; it runs once per app and only when the version changed.
- With the app's host offline, requests no longer wait 15 s for a channel: unless a reconnection is in progress they fail
  at once, so a cached app renders immediately and can show its own offline state.

### Added
- Optional `update_check` {url, field} in the app's `/.well-known/mylan.json`: after each (re)connection MyLAN compares
  the cached copy with the host's version and refreshes the cached files in the background (staging cache, swapped in
  only when every file arrived), then sends `mylan:app-updated`; a manual check gets `mylan:update-result`. Without the
  field a fingerprint of the initial page is compared.

### Changed
- First download of an app is parallel (6 files at a time, about 2.5x faster on a mobile link).
- The host's answer on the signaling relay is read by streaming instead of polling every 2.5 s (up to 2.5 s saved per
  connection).
- Cache first: a saved app opens from its cache before and independently of the channel.
- Removing an app also deletes its staging cache and remembered version.

## [Initial commit] fa73e55 - 2026-10-04

State of MyLAN at the history reset (summary of the work included in that commit).

### Isolation and storage
- One session per saved app: iframe at `/session/<key>/`, cache `mylan-session-v3:<key>`, initial page, Web Storage
  namespace (`mylan-app:<key>:`) and ICE servers per app, all removed with the app; MyLAN's own keys and caches are
  hidden from apps. Apps still share one browser origin (INTEGRATION §8).
- Developer-tool warning in the README and INTEGRATION §8: connect only your own or trusted apps; no responsibility for
  third-party apps. "One origin per app via subdomains" documented as evaluated and not adopted (no domain purchase).

### Transport
- Request bodies reach the host byte-identical (JSON, text, Blob, files, FormData); bodies over 64 KB are sent as binary
  frames when the app declares `chunked_uploads`, otherwise the app gets a local 413.
- Requests go only over the channel of that app's host; switching app reconnects. With two or more MyLAN tabs the
  Service Worker relays through the tab that hosts the app.
- STUN by default, no bundled TURN; optional `ice` field in the host's encrypted answer (e.g. a self-hosted TURN),
  remembered per app; with TURN MyLAN waits for a relay candidate (+600 ms, at most 6 s). Clear message after 30 s
  when no direct path exists.
- Signaling topics use the `mylan-` prefix (hosts must use the same prefix).

### Interface
- Viewer sized with `dvh`; per-app PWA manifest and icon.
