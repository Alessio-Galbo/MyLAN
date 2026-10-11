"""App registry of MyLAN Host (data/apps.json): id, name, local base URL, protected flag, per-app secret and the
header names the secret and the device id travel in. Each app gets its own secret (one app cannot replay it to
another)."""
import secrets

from host import descriptor, store

FILE = "apps.json"
SECRET_HEADER, DEVICE_HEADER, PROTECTED_HEADER = "X-MyLAN-Host", "X-MyLAN-Device", "X-MyLAN-Protected"


def all_apps() -> dict:
    return store.read_json(FILE, {})


def get(app_id: str) -> dict | None:
    return all_apps().get(app_id)


def add(url: str, app_id: str = "", protected: bool = False, secret: str = "",
        secret_header: str = "", device_header: str = "", fetch=None) -> tuple[dict, bool]:
    """Register (or update) the app at `url` after reading its descriptor. Returns (entry, secret_is_new)."""
    base = descriptor.normalize_base(url)
    desc = (fetch or descriptor.fetch)(base)
    apps = all_apps()
    app_id = descriptor.slug(app_id or desc.get("short_name") or desc.get("name"))
    old = apps.get(app_id, {})
    new_secret = not (secret or old.get("secret"))
    entry = {
        "id": app_id, "name": str(desc.get("name") or desc.get("short_name"))[:80], "base_url": base,
        "protected": bool(protected), "secret": secret or old.get("secret") or secrets.token_urlsafe(32),
        "secret_header": secret_header or old.get("secret_header") or SECRET_HEADER,
        "device_header": device_header or old.get("device_header") or DEVICE_HEADER,
        "descriptor": descriptor.summary(desc),
    }
    apps[app_id] = entry
    store.write_json(FILE, apps)
    return entry, new_secret


def remove(app_id: str) -> bool:
    apps = all_apps()
    if apps.pop(app_id, None) is None:
        return False
    store.write_json(FILE, apps)
    return True


def public_view(entry: dict) -> dict:
    """Entry without the secret (lists, logs)."""
    return {k: v for k, v in entry.items() if k != "secret"}
