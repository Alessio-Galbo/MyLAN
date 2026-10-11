"""Approved phones (data/devices.json), one entry per (phone, app) pairing. The reconnect token is needed in clear
to listen for return visits, so on disk there is only its hash plus a copy sealed with data/host.key (a copy of
devices.json alone gives no access). Idea from FaMiLAN backend/app/services/remote/return_secret.py."""
import hashlib
import hmac
import os
import secrets
import time

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from host import store

FILE, KEY_FILE = "devices.json", "host.key"


def _key() -> bytes:
    path = store.data_dir() / KEY_FILE
    try:
        key = bytes.fromhex(path.read_text(encoding="ascii").strip())
    except (OSError, ValueError):
        key = b""
    if len(key) != 32:
        key = AESGCM.generate_key(bit_length=256)
        path.write_text(key.hex(), encoding="ascii")
    return key


def _hash(token: str) -> str:
    return hashlib.sha256(f"mylan-host-return|{token}".encode("utf-8")).hexdigest()


def add(app_id: str, meta: dict) -> tuple[str, str]:
    """New pairing -> (device_id chosen by the Host, reconnect token to send once)."""
    device_id, token = f"mh_{secrets.token_hex(8)}", secrets.token_urlsafe(32)
    nonce = os.urandom(12)
    sealed = (nonce + AESGCM(_key()).encrypt(nonce, token.encode(), device_id.encode())).hex()
    data = store.read_json(FILE, {})
    data[device_id] = {"app": app_id, "meta": meta, "created": int(time.time()), "token_hash": _hash(token),
                       "token_sealed": sealed, "revoked": False}
    store.write_json(FILE, data)
    return device_id, token


def token_of(device_id: str, dev: dict) -> str | None:
    try:
        raw = bytes.fromhex(dev["token_sealed"])
        token = AESGCM(_key()).decrypt(raw[:12], raw[12:], device_id.encode()).decode()
    except Exception:
        return None
    return token if hmac.compare_digest(_hash(token), dev.get("token_hash", "")) else None


def active() -> dict:
    return {d: v for d, v in store.read_json(FILE, {}).items() if not v.get("revoked")}


def revoke(device_id: str) -> bool:
    data = store.read_json(FILE, {})
    if device_id not in data:
        return False
    data[device_id]["revoked"] = True
    store.write_json(FILE, data)
    return True
