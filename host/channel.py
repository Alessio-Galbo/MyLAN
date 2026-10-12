"""Requests of one DataChannel bound to (app, device): JSON requests, aborts, chunked uploads (binary 0x42 frames,
APP_SPEC §4.1), WebSockets (§4.4, ws_tunnel.py), at most MAX_ACTIVE served at once and MAX_PENDING queued (beyond:
429), everything stopped when the channel closes. Adapted from FaMiLAN
backend/app/services/remote/webrtc_channel_guard.py."""
import asyncio

from host import forward, frames, wire, ws_tunnel

MAX_ACTIVE, MAX_PENDING, MAX_UPLOAD = 16, 1024, 256 * 1024 * 1024


class ChannelServer:
    def __init__(self, channel, app_id: str, device_id: str, runner=forward.forward) -> None:
        self.channel, self.app_id, self.device_id, self.runner = channel, app_id, device_id, runner
        self.sem = asyncio.Semaphore(MAX_ACTIVE)
        self.aborts: dict[str, asyncio.Event] = {}
        self.tasks: dict[str, asyncio.Task] = {}
        self.uploads: dict[str, tuple[dict, bytearray]] = {}
        self.sockets: dict = {}  # tunnelled WebSockets (ws_tunnel.py)
        self.closed = False

    def on_message(self, raw) -> None:
        if self.closed:
            return
        if isinstance(raw, (bytes, bytearray)):
            self._on_binary(bytes(raw))
            return
        parsed = wire.parse_text(raw)
        if not parsed:
            return
        req_id, msg = parsed
        kind = msg.get("type")
        if kind == "abort":
            self.uploads.pop(req_id, None)
            if req_id in self.aborts:
                self.aborts[req_id].set()
        elif kind in ws_tunnel.TYPES:
            ws_tunnel.handle(self, req_id, msg)
        elif kind is None and req_id not in self.aborts and req_id not in self.uploads:
            size = msg.get("body_size")
            if not msg.get("body_chunked"):
                self._schedule(req_id, msg, wire.body(msg))
            elif isinstance(size, int) and 0 <= size <= MAX_UPLOAD:
                self.uploads[req_id] = (msg, bytearray())
            else:
                frames.reply_status(self.channel, req_id, 413, "mylan_host_upload_too_large")

    def _on_binary(self, raw: bytes) -> None:
        parsed = wire.parse_binary(raw)
        item = self.uploads.get(parsed[0]) if parsed else None
        if not item:
            return
        req_id, more, payload = parsed
        msg, buf = item
        buf += payload
        if len(buf) > msg["body_size"]:
            self.uploads.pop(req_id, None)
            frames.reply_status(self.channel, req_id, 413, "mylan_host_upload_too_large")
        elif not more:
            self.uploads.pop(req_id, None)
            self._schedule(req_id, msg, bytes(buf))

    def _schedule(self, req_id: str, msg: dict, body: bytes) -> None:
        if len(self.aborts) >= MAX_PENDING:
            frames.reply_status(self.channel, req_id, 429, "mylan_host_busy")
            return
        self.aborts[req_id] = asyncio.Event()
        self.tasks[req_id] = asyncio.get_running_loop().create_task(self._run(req_id, msg, body))

    async def _run(self, req_id: str, msg: dict, body: bytes) -> None:
        try:
            async with self.sem:
                if not self.aborts[req_id].is_set():
                    await self.runner(self.app_id, self.device_id, msg, body, self.channel, req_id, self.aborts[req_id])
        finally:
            self.tasks.pop(req_id, None)
            self.aborts.pop(req_id, None)

    def close(self) -> None:
        self.closed = True
        self.uploads.clear()
        ws_tunnel.close_all(self)
        for evt in self.aborts.values():
            evt.set()
        for task in list(self.tasks.values()):
            task.cancel()

