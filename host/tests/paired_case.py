"""Base test case for the end-to-end tests: isolated data dir, in-memory relay, fake app registered (protected), the
Host daemon running, and pair() for a simulated phone with real aiortc (approved or refused through pending)."""
import asyncio
import unittest

from host import apps, crypto, daemon, invites, pending, relay
from host.tests import fake_app, fakes
from host.tests.phone import Phone


class PairedCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        fakes.isolate(self)
        self.relay = fakes.FakeRelay()
        relay.set_relay(self.relay)
        self.runner, base = await fake_app.start_app()
        self.app, _ = await asyncio.to_thread(apps.add, base, "fake", True)
        daemon.SYNC_S, self.stop = 0.2, asyncio.Event()
        self.host = asyncio.ensure_future(daemon.run(self.stop, say=lambda *_: None))
        self.phones: list[Phone] = []

    async def asyncTearDown(self) -> None:
        self.stop.set()
        await self.host
        for p in self.phones:
            await p.pc.close()
        await self.runner.cleanup()

    async def pair(self, approve: bool) -> tuple[Phone, dict]:
        inv = invites.create("fake")
        keys = crypto.invite_keys(inv["code"])
        phone = Phone()
        self.phones.append(phone)
        await relay.send(keys.topic_offer, keys.offer_key, await phone.offer({}))
        for _ in range(100):
            await asyncio.sleep(0.1)
            if pending.decide(inv["code"], approve):
                break
        return phone, await relay.receive(keys.topic_answer, keys.answer_key, timeout=20)
