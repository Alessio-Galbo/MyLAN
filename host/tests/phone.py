"""Simulated phone for the end-to-end test: the browser side of MyLAN reduced to an aiortc peer and a request helper."""
import asyncio
import json
import secrets

from aiortc import RTCPeerConnection, RTCSessionDescription

from host.tests import fakes


class Phone:
    """The browser side of MyLAN, reduced to what the Host sees."""

    def __init__(self) -> None:
        self.pc, self.frames, self.opened = RTCPeerConnection(), [], asyncio.Event()
        self.ch = self.pc.createDataChannel("mylan-api")
        self.ch.on("open", self.opened.set)
        self.ch.on("message", self.frames.append)

    async def offer(self, extra: dict) -> dict:
        await self.pc.setLocalDescription(await self.pc.createOffer())
        return {"type": "offer", "sdp": self.pc.localDescription.sdp, "device_id": "dev_x", "meta": {"os": "Test"},
                **extra}

    async def connect(self, answer: dict) -> None:
        await self.pc.setRemoteDescription(RTCSessionDescription(answer["sdp"], "answer"))
        await asyncio.wait_for(self.opened.wait(), 20)

    async def get(self, path: str) -> tuple[dict, bytes]:
        rid = f"r{secrets.token_hex(3)}"
        self.ch.send(json.dumps({"id": rid, "method": "GET", "path": path, "headers": {}, "body": ""}))
        for _ in range(200):
            await asyncio.sleep(0.05)
            start, body = fakes.response(self.frames, rid)
            if start and any(isinstance(f, str) and '"more": false' in f and rid in f for f in self.frames):
                return start, body
        raise AssertionError("no response")
