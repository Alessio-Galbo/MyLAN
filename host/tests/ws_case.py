"""Base test case for the WebSocket tunnel: isolated data dir, fake app registered, a ChannelServer on a recording
channel (self.ch), helpers to send frames and wait for the ws-* answers of one id."""
import asyncio
import unittest

from host import apps, forward
from host.tests import fake_app, fakes
from host.tests.ws_helpers import received


class TunnelCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        fakes.isolate(self)
        self.runner, self.base = await fake_app.start_app()
        self.app, _ = await asyncio.to_thread(apps.add, self.base, "", True)
        self.ch = fakes.channel_server("mylan-api", self.app["id"])

    async def asyncTearDown(self) -> None:
        self.ch.server.close()
        await asyncio.sleep(0.1)
        await forward.close_session()
        await self.runner.cleanup()

    def send(self, *frames) -> None:
        for f in frames:
            self.ch.server.on_message(f)

    async def until(self, conn_id: str, count: int, channel=None) -> list:
        sent = (channel or self.ch.channel).sent
        for _ in range(300):
            got = received(sent, conn_id)
            if len(got) >= count:
                return got
            await asyncio.sleep(0.02)
        return received(sent, conn_id)
