# MyLAN — Direct P2P Gateway & Springboard

> *"Your personal LAN anywhere, via direct P2P connection with zero open ports and zero cloud."*

> [!WARNING]
> **Developer tool: connect only apps you wrote or fully trust.** All apps opened through one MyLAN deployment share
> **one browser origin**, so a malicious app could read the other apps' data and reconnect tokens on that device
> ([docs/INTEGRATION.md §8](docs/INTEGRATION.md#8-security-model)). MyLAN is meant for developers to test and reach
> **their own** apps; it assumes the developer connects only apps they trust. No responsibility is taken for
> third-party apps opened through MyLAN or for what they do with the data on the device.

MyLAN is a stand-alone, general-purpose service for developers of local/LAN web apps and PWAs: it gives them a trusted HTTPS origin, PWA installation (of MyLAN as a hub, or of a single app with its own name and icon) and a direct P2P path to a home server from outside.

MyLAN is a lightweight, zero-dependency, open-source client portal and springboard that enables secure peer-to-peer WebRTC connections between a remote browser and a self-hosted host computer.

---

## Key Features

- **Zero Open Ports**: MyLAN itself needs no router port forwarding, no UPnP and no public IP exposure: it is a static site and only uses outbound connections. An app host may optionally open one UDP port on its router, only while an invite is pending, to get through mobile CGNAT (see [docs/INTEGRATION.md](docs/INTEGRATION.md#6-the-p2p-link-stun-by-default-optional-host-turn)).
- **Zero Cloud Accounts**: Direct end-to-end connection between devices without third-party VPNs or cloud relaying.
- **Encrypted Signaling**: Ephemeral, zero-knowledge handshake using WebCrypto (HKDF-SHA256 & AES-256-GCM).
- **NAT Traversal (STUN by default)**: Public STUN servers for direct hole punching; MyLAN ships no TURN relay (paid or capped relays are deliberately not used). A host app may send its own ICE servers (e.g. a self-hosted TURN) in the encrypted answer, and MyLAN then uses them for that app. Without them, if both networks block a direct connection (e.g. symmetric 4G/5G CGNAT on both sides), MyLAN shows a clear message instead of waiting forever.
- **Saved Apps Hub**: Launcher for previously connected applications.
- **Per-App PWA Install**: Install the MyLAN hub, or a single app through its link `?app=<slug>` so the installed PWA opens that app directly with its own name and icon.
- **Fully Modular & Bilingual**: Strict ES module architecture, semantic CSS, and native EN/IT i18n.

---

## PWA & Local Dev Testing Superpower

Developers frequently hit obstacles when testing mobile web applications and PWAs on physical phones:
1. **The HTTPS Dilemma**: Modern APIs like Service Workers, Web Workers, AudioWorklet, WebRTC, and device sensors require a trusted `https://` context.
2. **Self-Signed SSL Headaches**: Local SSL certificates cause browser security warnings, require tedious root CA installation on phones, or get blocked by local firewalls.

**How MyLAN Solves This:**
By providing an immediate, globally valid `https://` trampoline via GitHub Pages, any developer can run their local web app or PWA on localhost and access it from any remote phone with a trusted HTTPS origin and zero router configuration.

---

## App Integration & Specification

Any web application or PWA can integrate with MyLAN by providing its manifest (`/.well-known/mylan.json` or `manifest.json`) and a small host-side companion that answers the encrypted handshake and bridges DataChannel requests to its HTTP server.

- [docs/INTEGRATION.md](docs/INTEGRATION.md): how it works and how to integrate (registration, HTTPS container and viewer, host-side handshake, STUN P2P with optional host-provided TURN, CGNAT, per-app PWA install, security model, known limits).
- [docs/APP_SPEC.md](docs/APP_SPEC.md): wire formats (DataChannel protocol, chunk framing, `postMessage` bridge).

---

## License

MIT License. Open-source and free for developers and the community.
