"""Test doubles: an isolated data dir, an in-memory signaling relay, a DataChannel that records frames (and reassembles responses)."""
import asyncio
import base64
import json
import os
import tempfile

from host import store


def isolate(test) -> None:
    tmp = tempfile.TemporaryDirectory()
    test.addCleanup(tmp.cleanup)
    old = os.environ.get("MYLAN_HOST_DIR")
    os.environ["MYLAN_HOST_DIR"] = tmp.name
    test.addCleanup(lambda: os.environ.__setitem__("MYLAN_HOST_DIR", old) if old else os.environ.pop("MYLAN_HOST_DIR"))
    store.write_json("config.json", {"ice_servers": [], "portal_url": "https://example.test/MyLAN/"})


class FakeRelay:
    def __init__(self) -> None:
        self.topics: dict[str, asyncio.Queue] = {}

    def _q(self, topic: str) -> asyncio.Queue:
        return self.topics.setdefault(topic, asyncio.Queue())

    async def post(self, topic: str, text: str) -> bool:
        await self._q(topic).put(text)
        return True

    async def wait(self, topic: str, timeout: float, since: str = "all") -> str | None:
        try:
            return await asyncio.wait_for(self._q(topic).get(), min(timeout, 2.0))
        except asyncio.TimeoutError:
            return None


class FakeChannel:
    def __init__(self, label: str = "mylan-api") -> None:
        self.label, self.readyState, self.bufferedAmount, self.sent = label, "open", 0, []

    def send(self, frame) -> None:
        self.sent.append(frame)


def response(frames: list, req_id: str) -> tuple[dict, bytes]:
    """(start message, body bytes) of one request from JSON and binary frames."""
    start, body = {}, b""
    for f in frames:
        if isinstance(f, bytes):
            if f[3:3 + f[1]].decode() == req_id:
                body += f[3 + f[1]:]
            continue
        msg = json.loads(f)
        if msg.get("id") != req_id:
            continue
        if msg.get("type") == "start":
            start = msg
        elif msg.get("type") == "chunk":
            body += base64.b64decode(msg["data"])
    return start, body


def channel_server(label: str, app_id: str):
    """A ChannelServer on a FakeChannel, device mh_test (attributes .channel and .server)."""
    from types import SimpleNamespace
    from host.channel import ChannelServer
    channel = FakeChannel(label)
    return SimpleNamespace(channel=channel, server=ChannelServer(channel, app_id, "mh_test"))
