"""Header rules of the forwarding: what the phone may not set (hop-by-hop, proxy and Host-identity headers, any copy
of the Host's own headers), what the Host adds (per-app secret, device id, protected flag), what goes back."""
from host import apps

HOP = {"connection", "keep-alive", "transfer-encoding", "te", "trailer", "upgrade", "proxy-authorization",
       "proxy-authenticate", "proxy-connection", "host", "content-length", "forwarded", "x-forwarded-for",
       "x-forwarded-host", "x-forwarded-proto", "x-real-ip"}
OWN_PREFIXES = ("x-mylan-host", "x-mylan-device", "x-mylan-protected")
MAX_HEADERS, MAX_HEADER_BYTES = 64, 16 * 1024


def problem(raw) -> tuple[int, str] | None:
    if raw is None:
        return None
    if not isinstance(raw, dict):
        return 400, "mylan_host_bad_headers"
    if len(raw) > MAX_HEADERS or sum(len(str(k)) + len(str(v)) for k, v in raw.items()) > MAX_HEADER_BYTES:
        return 431, "mylan_host_headers_too_large"
    return None


def outgoing(raw: dict | None, app: dict, device_id: str) -> dict:
    """Headers for the local app: the phone's ones minus the forbidden, plus the Host's (always overriding)."""
    own = {app.get("secret_header", apps.SECRET_HEADER).lower(), app.get("device_header", apps.DEVICE_HEADER).lower()}
    out = {}
    for k, v in (raw or {}).items():
        name = str(k).strip().lower()
        if not name or name in HOP or name in own or name.startswith(OWN_PREFIXES) or "\n" in str(v) or "\r" in str(v):
            continue
        out[name] = str(v)
    out[app.get("secret_header", apps.SECRET_HEADER)] = app["secret"]
    out[app.get("device_header", apps.DEVICE_HEADER)] = device_id
    out[apps.PROTECTED_HEADER] = "1" if app.get("protected") else "0"
    return out


def incoming(resp_headers) -> dict:
    """Response headers for the phone (repeated names joined, hop-by-hop dropped; content-length kept)."""
    out: dict = {}
    for k, v in resp_headers.items():
        name = k.lower()
        if name in HOP - {"content-length"}:
            continue
        out[name] = f"{out[name]}, {v}" if name in out else v
    return out
