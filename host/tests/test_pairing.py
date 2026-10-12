"""End to end with real aiortc on this PC and the in-memory relay: a simulated phone pairs through an invite
(approved with `approve`), reaches the fake app over the DataChannel, comes back with its reconnect token; a
refused invite answers `rejected`."""
import json
import unittest

from host import crypto, invites, relay
from host.tests.paired_case import PairedCase
from host.tests.phone import Phone


class PairingTest(PairedCase):
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
