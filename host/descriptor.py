"""Reads an app's /.well-known/mylan.json (APP_SPEC §2) from its local base URL: fixed path, no redirects, 5 s and
256 KB at most. Only the URL the PC user typed is fetched (apps add), never a URL coming from a phone."""
import json
import re
import urllib.error
import urllib.request
from urllib.parse import urlsplit

PATH, MAX_BYTES, TIMEOUT_S = "/.well-known/mylan.json", 256 * 1024, 5.0


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def normalize_base(url: str) -> str:
    """http(s)://host[:port][/prefix] without query, fragment or trailing slash; ValueError otherwise."""
    parts = urlsplit((url or "").strip())
    if parts.scheme not in ("http", "https") or not parts.hostname or parts.query or parts.fragment:
        raise ValueError(url)
    return f"{parts.scheme}://{parts.netloc}{parts.path.rstrip('/')}"


def fetch(base_url: str) -> dict:
    """The descriptor as a dict; ValueError when missing, too big or not a JSON object."""
    opener = urllib.request.build_opener(_NoRedirect)
    try:
        with opener.open(normalize_base(base_url) + PATH, timeout=TIMEOUT_S) as resp:
            raw = resp.read(MAX_BYTES + 1)
    except (urllib.error.URLError, OSError) as exc:
        raise ValueError(str(exc)) from exc
    if len(raw) > MAX_BYTES:
        raise ValueError("descriptor too big")
    data = json.loads(raw.decode("utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("name") or data.get("short_name"), str):
        raise ValueError("descriptor without name")
    return data


def slug(text: str) -> str:
    out = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    return out[:40] or "app"


def summary(desc: dict) -> dict:
    """What the Host keeps of the descriptor (the phone reads the full one through the channel anyway)."""
    keep = ("name", "short_name", "version", "chunked_uploads", "websocket", "media_paths")
    return {k: desc[k] for k in keep if k in desc}
