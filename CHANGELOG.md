# Changelog

All notable changes to MyLAN. The git history was reset to a single "Initial commit" on 2026-10-04.

## [Unreleased]

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
