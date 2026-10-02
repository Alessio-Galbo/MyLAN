# MyLAN — Direct P2P Gateway & Springboard

> *"Your personal LAN anywhere, via direct P2P connection with zero open ports and zero cloud."*

MyLAN is a lightweight, zero-dependency, open-source client portal and springboard that enables secure peer-to-peer WebRTC connections between a remote browser and a self-hosted host computer.

---

## Key Features

- **Zero Open Ports**: No router port forwarding, no UPnP, and no public IP exposure required.
- **Zero Cloud Accounts**: Direct end-to-end connection between devices without third-party VPNs or cloud relaying.
- **Encrypted Signaling**: Ephemeral, zero-knowledge handshake using WebCrypto (HKDF-SHA256 & AES-256-GCM).
- **Cellular & NAT Traversal**: Built-in STUN & TURN relays to punch through symmetric mobile 4G/5G CGNAT.
- **Saved Apps Hub**: Seamless launcher for previously connected applications with instant switching.
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

Any web application or PWA can integrate seamlessly with MyLAN by providing its manifest (`/.well-known/mylan.json` or `manifest.json`). For technical details on the DataChannel protocol and container bridge, see [docs/APP_SPEC.md](docs/APP_SPEC.md).

---

## License

MIT License. Open-source and free for developers and the community.
