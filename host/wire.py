"""Parsing of the phone's DataChannel messages (APP_SPEC §4.1): JSON frames with a safe id, binary 0x42 upload
frames, request bodies (base64 of the exact bytes, never decoded to text)."""
import base64
import json
import re

MAX_FRAME = 128 * 1024
REQ_ID = re.compile(r"^[A-Za-z0-9_.:-]{1,64}$")


def parse_text(raw) -> tuple[str, dict] | None:
    if not isinstance(raw, str) or len(raw) > MAX_FRAME:
        return None
    try:
        msg = json.loads(raw)
    except ValueError:
        return None
    req_id = msg.get("id") if isinstance(msg, dict) else None
    return (req_id, msg) if isinstance(req_id, str) and REQ_ID.match(req_id) else None


def parse_binary(raw: bytes) -> tuple[str, bool, bytes] | None:
    """0x42 | id length | more | ASCII id | payload."""
    if len(raw) < 3 or raw[0] != 0x42 or len(raw) < 3 + raw[1]:
        return None
    return raw[3:3 + raw[1]].decode("ascii", "replace"), bool(raw[2]), raw[3 + raw[1]:]


def body(msg: dict) -> bytes:
    raw = msg.get("body") or msg.get("body_b64") or ""
    try:
        return base64.b64decode(raw, validate=True) if isinstance(raw, str) else b""
    except ValueError:
        return b""


def ws_refusal(req_id: str) -> str:
    """WebSocket tunnel (APP_SPEC §4.4) not carried by MyLAN Host yet: the app sees a refused socket."""
    return json.dumps({"type": "ws-close", "id": req_id, "code": 1008, "reason": "mylan_host_no_websocket"})
