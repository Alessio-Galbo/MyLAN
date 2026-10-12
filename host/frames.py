"""Writing responses on a DataChannel (APP_SPEC §4.2-4.3): start, JSON base64 chunks on mylan-api, binary 0x42 frames
on mylan-media, backpressure on bufferedAmount. Adapted from FaMiLAN backend/app/services/remote/webrtc_asgi_helpers.py
and webrtc_request_limits.py."""
import asyncio
import base64
import json

CHUNK = 65536 - 1024  # binary frame header + id stay under 64 KB
JSON_CHUNK = 45 * 1024  # base64 grows by 4/3: the JSON message stays under 64 KB
HIGH_WATER, LOW_WATER, STALL_S = 262144, 65536, 60.0


def is_open(channel) -> bool:
    return getattr(channel, "readyState", "open") == "open"


def safe_send(channel, frame) -> bool:
    if not is_open(channel):
        return False
    try:
        channel.send(frame)
    except Exception:
        return False
    return True


def send_start(channel, req_id: str, status: int, headers: dict) -> bool:
    return safe_send(channel, json.dumps({"id": req_id, "type": "start", "status": status, "headers": headers}))


def reply_status(channel, req_id: str, status: int, reason: str) -> None:
    """A complete small JSON answer; the reason also in `x-mylan-host-reason`."""
    body = json.dumps({"detail": reason}).encode("utf-8")
    send_start(channel, req_id, status, {"content-type": "application/json", "x-mylan-host-reason": reason})
    safe_send(channel, json.dumps({"id": req_id, "type": "chunk", "data": base64.b64encode(body).decode(), "more": False}))


async def drain(channel, abort: asyncio.Event) -> None:
    waited = 0.0
    while getattr(channel, "bufferedAmount", 0) > (LOW_WATER if waited else HIGH_WATER):
        if abort.is_set() or not is_open(channel) or waited >= STALL_S:
            abort.set()
            return
        await asyncio.sleep(0.01)
        waited += 0.01


async def send_body(channel, req_id: str, data: bytes, more: bool, abort: asyncio.Event) -> None:
    """One piece of the response body (possibly empty, e.g. the final `more: false`)."""
    media = str(getattr(channel, "label", "")).startswith("mylan-media")
    size = CHUNK if media else JSON_CHUNK
    for i in range(0, max(len(data), 1), size):
        await drain(channel, abort)
        if abort.is_set():
            return
        part, last = data[i:i + size], i + size >= len(data) and not more
        if media:
            rid = req_id.encode("ascii")
            frame = bytes([0x42, len(rid), 0 if last else 1]) + rid + part
        else:
            frame = json.dumps({"id": req_id, "type": "chunk", "data": base64.b64encode(part).decode(), "more": not last})
        if not safe_send(channel, frame):
            abort.set()
            return
