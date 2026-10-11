"""Signaling crypto of docs/INTEGRATION.md §5: AES-256-GCM envelopes, invite protocol 2 (PBKDF2 + HKDF) and the
protocol 1 derivation still used for return visits. Adapted from FaMiLAN backend/app/services/remote/crypto_*.py."""
import base64
import hashlib
import json
import os
import re
from dataclasses import dataclass

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

MAX_ENVELOPE = 4096


@dataclass(frozen=True)
class InviteKeys:
    offer_key: bytes  # phone -> host
    answer_key: bytes  # host -> phone (answer or refusal)
    topic_offer: str
    topic_answer: str


def normalize_code(code: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", code or "").upper()


def _hkdf(material: bytes, salt: bytes, info: bytes, length: int) -> bytes:
    return HKDF(algorithm=hashes.SHA256(), length=length, salt=salt, info=info).derive(material)


def invite_keys(code: str, iterations: int = 200_000) -> InviteKeys:
    """Protocol 2. Slow on purpose (PBKDF2): call it with asyncio.to_thread from the event loop."""
    master = hashlib.pbkdf2_hmac("sha256", normalize_code(code).encode(), b"MyLAN-Remote-V2-Invite", iterations, 32)

    def key(info: str, n: int) -> bytes:
        return _hkdf(master, b"MyLAN-Remote-V2-HKDF", info.encode("ascii"), n)
    return InviteKeys(key("v2-offer", 32), key("v2-answer", 32),
                      f"mylan2-offer-{key('v2-topic-offer', 16).hex()}", f"mylan2-answer-{key('v2-topic-answer', 16).hex()}")


def return_key(token: str) -> bytes:
    """Protocol 1 key for return visits: one key for both directions, from the 256-bit reconnect token."""
    return _hkdf(token.strip().encode("utf-8"), b"MyLAN-Remote-V1-Salt", b"handshake", 32)


def return_topic(token: str, prefix: str) -> str:
    """prefix: reconnect-offer | reconnect-answer."""
    digest = hashlib.sha256(f"ntfy-topic-{prefix}-{token.strip()}".encode("utf-8")).hexdigest()
    return f"mylan-{prefix}-{digest[:20]}"


def seal(data: dict, key: bytes) -> str:
    nonce = os.urandom(12)
    raw = nonce + AESGCM(key).encrypt(nonce, json.dumps(data, separators=(",", ":")).encode("utf-8"), None)
    out = base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")
    if len(out) > MAX_ENVELOPE:
        raise ValueError(f"envelope of {len(out)} B over {MAX_ENVELOPE} B")
    return out


def unseal(text: str, key: bytes) -> dict | None:
    """None when tampered, for another key, too big or not JSON."""
    if not text or len(text) > MAX_ENVELOPE:
        return None
    try:
        s = text.strip()
        raw = base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))
        data = json.loads(AESGCM(key).decrypt(raw[:12], raw[12:], None).decode("utf-8"))
    except Exception:
        return None
    return data if isinstance(data, dict) else None
