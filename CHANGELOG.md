# Changelog

All notable changes to MyLAN. The git history was reset to a single "Initial commit" on 2026-10-04.

## [Unreleased]

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
