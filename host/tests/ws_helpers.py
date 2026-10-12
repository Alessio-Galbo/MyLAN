"""Helpers for the WebSocket tunnel tests: ws-* frames to send and the ws-* frames a channel received for one id."""
import base64
import json


def ws_open(conn_id: str, path: str = "/ws", protocols=("p1",), hdrs=None) -> str:
    return json.dumps({"type": "ws-open", "id": conn_id, "path": path, "headers": hdrs or {}, "protocols": list(protocols)})


def ws_text(conn_id: str, text: str, more: bool = False) -> str:
    return json.dumps({"type": "ws-msg", "id": conn_id, "text": text, "more": more})


def ws_bin(conn_id: str, data: bytes) -> str:
    return json.dumps({"type": "ws-msg", "id": conn_id, "bin": base64.b64encode(data).decode(), "more": False})


def ws_close(conn_id: str, code: int = 1000) -> str:
    return json.dumps({"type": "ws-close", "id": conn_id, "code": code, "reason": ""})


def received(frames: list, conn_id: str) -> list:
    """ws-* messages for conn_id, with the ws-msg parts joined: ("accept", protocol), ("text", str), ("bin", bytes),
    ("close", code, reason)."""
    out, parts = [], []
    for f in frames:
        msg = json.loads(f) if isinstance(f, str) else {}
        if msg.get("id") != conn_id:
            continue
        if msg.get("type") == "ws-accept":
            out.append(("accept", msg.get("protocol")))
        elif msg.get("type") == "ws-close":
            out.append(("close", msg.get("code"), msg.get("reason")))
        elif msg.get("type") == "ws-msg":
            parts.append(msg.get("text", msg.get("bin")))
            if not msg.get("more"):
                data = "".join(parts)
                out.append(("text", data) if "text" in msg else ("bin", base64.b64decode(data)))
                parts = []
    return out
