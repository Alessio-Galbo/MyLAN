"""Phone -> app messages of a tunnelled WebSocket (APP_SPEC §4.4): `ws-msg` parts with `more: true` are joined until
the last one, then the whole message is queued for the app. Over MAX_MESSAGE characters 1009, bad base64 1007, phone
faster than the app (queue full) 1013. Adapted from FaMiLAN backend/app/services/remote/webrtc_ws_inbound.py."""
import base64

MAX_MESSAGE, MAX_QUEUE = 256 * 1024, 64


def feed(conn, msg: dict) -> None:
    key = "text" if isinstance(msg.get("text"), str) else "bin" if isinstance(msg.get("bin"), str) else None
    if not key or conn.closed:
        return
    conn.parts.append(msg[key])
    conn.size += len(msg[key])
    if conn.size > MAX_MESSAGE:
        return conn.shut(1009, "mylan_host_message_too_large")
    if msg.get("more"):
        return
    data, conn.parts, conn.size = "".join(conn.parts), [], 0
    try:
        item = ("text", data) if key == "text" else ("bin", base64.b64decode(data.encode("ascii"), validate=True))
    except ValueError:
        return conn.shut(1007, "mylan_host_bad_message")
    if conn.inbox.qsize() >= MAX_QUEUE:
        return conn.shut(1013, "mylan_host_busy")
    conn.inbox.put_nowait(item)
