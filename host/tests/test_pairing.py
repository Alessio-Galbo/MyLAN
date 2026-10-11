"""End to end with real aiortc on this PC and the in-memory relay: a simulated phone pairs through an invite
(approved with `approve`), reaches the fake app over the DataChannel, comes back with its reconnect token; a
refused invite answers `rejected`."""
import asyncio
import json
import unittest

from host import apps, crypto, daemon, invites, pending, relay
from host.tests import fake_app, fakes
from host.tests.phone import Phone


class PairingTest(unittest.IsolatedAsyncioTestCase):
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

    async def test_pair_forward_and_return(self) -> None:
        phone, answer = await self.pair(approve=True)
        self.assertEqual(answer["type"], "answer")
        await phone.connect(answer)
        start, body = await phone.get("/echo")
        self.assertEqual(start["status"], 200)
        self.assertEqual(json.loads(body)["headers"]["X-MyLAN-Protected"], "1")
        token, nonce = answer["reconnect_token"], "n0nce123"
        back = Phone()
        self.phones.append(back)
        key = crypto.return_key(token)
        await relay.send(crypto.return_topic(token, "reconnect-offer"), key, await back.offer({"nonce": nonce}))
        again = await relay.receive(crypto.return_topic(token, "reconnect-answer"), key, timeout=20)
        self.assertEqual(again["nonce"], nonce)
        await back.connect(again)
        self.assertEqual((await back.get("/echo"))[0]["status"], 200)

    async def test_refused_invite(self) -> None:
        _, answer = await self.pair(approve=False)
        self.assertEqual(answer, {"type": "rejected", "reason": "declined"})
        self.assertEqual(invites.live(), {})


if __name__ == "__main__":
    unittest.main()
