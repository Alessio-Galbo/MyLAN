"""One-time invites (data/invites.json): 12-character code bound to ONE app, 15 minutes at most, single use. The
running Host listens on every live invite; `host invite <app>` only writes here."""
import secrets
import time

from host import crypto, store

FILE = "invites.json"
CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"  # no 0/O/1/I


def _fmt(code: str) -> str:
    return f"{code[:4]}-{code[4:8]}-{code[8:]}"


def create(app_id: str, minutes: int = 15) -> dict:
    code = "".join(secrets.choice(CHARS) for _ in range(12))
    minutes = min(max(int(minutes), 1), 15)
    data = {k: v for k, v in store.read_json(FILE, {}).items() if v.get("expires_at", 0) > time.time()}
    data[code] = {"app": app_id, "expires_at": time.time() + minutes * 60, "used": False}
    store.write_json(FILE, data)
    portal = store.config()["portal_url"].rstrip("/")
    return {"code": _fmt(code), "app": app_id, "minutes": minutes, "link": f"{portal}/#i={code}&p=2"}


def live() -> dict:
    """{normalized code: invite} still usable."""
    now = time.time()
    return {c: v for c, v in store.read_json(FILE, {}).items() if not v.get("used") and v.get("expires_at", 0) > now}


def redeem(code: str) -> bool:
    """Mark used; False when it expired, was used or never existed (checked again at approval time)."""
    code = crypto.normalize_code(code)
    data = store.read_json(FILE, {})
    inv = data.get(code)
    if not inv or inv.get("used") or inv.get("expires_at", 0) <= time.time():
        return False
    inv["used"] = True
    store.write_json(FILE, data)
    return True
