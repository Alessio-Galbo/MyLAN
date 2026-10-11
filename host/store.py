"""Where MyLAN Host keeps its state (MYLAN_HOST_DIR, default host/data, never committed) and atomic JSON read/write."""
import json
import os
from pathlib import Path

DEFAULT_PORTAL = "https://alessio-galbo.github.io/MyLAN/"


def data_dir() -> Path:
    env = os.environ.get("MYLAN_HOST_DIR")
    path = Path(env).expanduser() if env else Path(__file__).resolve().parent / "data"
    path.mkdir(parents=True, exist_ok=True)
    return path


def read_json(name: str, default):
    try:
        data = json.loads((data_dir() / name).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default
    return data if isinstance(data, type(default)) else default


def write_json(name: str, data) -> None:
    """Write via a temp file + os.replace: a reader never sees half a file."""
    target = data_dir() / name
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_name(target.name + ".tmp")
    tmp.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    os.replace(tmp, target)


def config() -> dict:
    """data/config.json: portal_url (where MyLAN is published), ice_servers (STUN/TURN list, [] = none)."""
    cfg = read_json("config.json", {})
    cfg.setdefault("portal_url", os.environ.get("MYLAN_PORTAL_URL") or DEFAULT_PORTAL)
    cfg.setdefault("relay_url", os.environ.get("MYLAN_RELAY_URL") or "https://ntfy.sh")
    cfg.setdefault("ice_servers", ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"])
    return cfg
