"""Signaling relay (ntfy.sh or compatible): post one envelope, wait for the next one on a topic. Tests swap it for
an in-memory relay (set_relay). Adapted from FaMiLAN backend/app/services/remote/signaling_client.py."""
import asyncio
import time

import aiohttp

from host import crypto

RETRY_PAUSE_S, LIMIT_PAUSE_S = 2.0, 8.0


class NtfyRelay:
    def __init__(self, base_url: str) -> None:
        self.base = base_url.rstrip("/")

    async def post(self, topic: str, text: str) -> bool:
        for _ in range(2):
            try:
                async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=8)) as s:
                    async with s.post(f"{self.base}/{topic}", data=text.encode("ascii")) as r:
                        if r.status == 429:
                            await asyncio.sleep(2.5)
                            continue
                        return r.status in (200, 201)
            except (aiohttp.ClientError, asyncio.TimeoutError):
                await asyncio.sleep(1.0)
        return False

    async def wait(self, topic: str, timeout: float, since: str = "all") -> str | None:
        """First message on the topic (since = "all" or a unix time); None on timeout or error (after a pause)."""
        started = time.monotonic()
        try:
            to = aiohttp.ClientTimeout(total=timeout, sock_connect=5)
            async with aiohttp.ClientSession(timeout=to) as s:
                async with s.get(f"{self.base}/{topic}/raw?since={since}") as r:
                    if r.status == 429:
                        await asyncio.sleep(LIMIT_PAUSE_S)
                        return None
                    if r.status == 200:
                        async for line in r.content:
                            text = line.decode("utf-8", "replace").strip()
                            if text:
                                return text
        except (aiohttp.ClientError, asyncio.TimeoutError):
            pass
        if time.monotonic() - started < 1.0:
            await asyncio.sleep(RETRY_PAUSE_S)  # instant failure (no network): never hammer the relay
        return None


_RELAY: list = []


def set_relay(relay) -> None:
    _RELAY[:] = [relay]


def relay():
    if not _RELAY:
        from host.store import config
        _RELAY.append(NtfyRelay(config()["relay_url"]))
    return _RELAY[0]


async def send(topic: str, key: bytes, data: dict) -> bool:
    return await relay().post(topic, crypto.seal(data, key))


async def receive(topic: str, key: bytes, timeout: float, since: str = "all") -> dict | None:
    text = await relay().wait(topic, timeout, since)
    return crypto.unseal(text, key) if text else None
