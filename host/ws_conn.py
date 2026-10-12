"""One app WebSocket carried on the DataChannel (APP_SPEC §4.4): queue towards the app (filled by ws_inbound.feed),
app -> phone messages split under 64 KB with the channel's backpressure, close from either side (the phone learns
the app's close code and reason). Adapted from FaMiLAN backend/app/services/remote/webrtc_ws_session.py and
webrtc_ws_out.py."""
import asyncio
import base64
import json

import aiohttp

from host import frames

PART_CHARS, BIN_PART_CHARS = 8000, 48000  # text fully escaped (6 bytes a char) / base64: frames stay under 64 KB
NOT_SENDABLE = (1004, 1005, 1006, 1015)


def close_code(value, default: int = 1000) -> int:
    ok = isinstance(value, int) and 1000 <= value <= 4999 and value not in NOT_SENDABLE
    return value if ok else default


class WsConn:
    def __init__(self, channel, conn_id: str) -> None:
        self.channel, self.id = channel, conn_id
        self.inbox: asyncio.Queue = asyncio.Queue()
        self.parts, self.size, self.closed = [], 0, False
        self.ws: aiohttp.ClientWebSocketResponse | None = None
        self.task: asyncio.Task | None = None
        self.stall = asyncio.Event()

    def frame(self, kind: str, **fields) -> bool:
        return frames.safe_send(self.channel, json.dumps({"type": kind, "id": self.id, **fields}))

    def shut(self, code: int, reason: str = "", tell: bool = True) -> None:
        """End of the connection: the app's socket is closed with `code`, the phone told (ws-close) when `tell`."""
        if self.closed:
            return
        self.closed = True
        if tell:
            self.frame("ws-close", code=code, reason=reason)
        self.inbox.put_nowait(("close", code))

    async def _to_app(self) -> None:
        while True:
            kind, data = await self.inbox.get()
            if kind == "close":
                await self.ws.close(code=data)
                return
            await (self.ws.send_str(data) if kind == "text" else self.ws.send_bytes(data))

    async def _send_parts(self, key: str, data: str) -> None:
        step = PART_CHARS if key == "text" else BIN_PART_CHARS
        for i in range(0, max(len(data), 1), step):
            await frames.drain(self.channel, self.stall)
            if self.stall.is_set() or self.closed or not self.frame("ws-msg", **{key: data[i:i + step]},
                                                                    more=i + step < len(data)):
                return self.shut(1001, "mylan_host_channel_stalled", tell=False)

    async def pump(self) -> None:
        """Relay both ways until either side closes; the phone learns the app's close code."""
        writer = asyncio.ensure_future(self._to_app())
        try:
            while True:
                msg = await self.ws.receive()
                if msg.type == aiohttp.WSMsgType.TEXT:
                    await self._send_parts("text", msg.data)
                elif msg.type == aiohttp.WSMsgType.BINARY:
                    await self._send_parts("bin", base64.b64encode(msg.data).decode("ascii"))
                else:
                    break
            closed_by_app = msg.type == aiohttp.WSMsgType.CLOSE
            reason = msg.extra if closed_by_app and isinstance(msg.extra, str) else "mylan_host_app_broken"
            self.shut(close_code(self.ws.close_code, 1011), reason[:120] if closed_by_app else reason)
        finally:
            await asyncio.wait([writer], timeout=10)
            writer.cancel()
            if writer.done() and not writer.cancelled() and writer.exception():
                self.shut(1011, "mylan_host_app_broken", tell=False)
            if not self.ws.closed:
                await self.ws.close()
