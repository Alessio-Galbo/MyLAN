"""WebSocket tunnel end to end with real aiortc peers and the in-memory relay: a paired phone opens a WebSocket to the
fake app, echoes text and binary, sees the Host's headers (phone copies stripped), the app's close and its own close;
with the app down the open is answered with 1011."""
import asyncio
import json
import unittest

from host.tests import fake_ws
from host.tests.paired_case import PairedCase
from host.tests.ws_helpers import received, ws_bin, ws_close, ws_open, ws_text


class WsEndToEndTest(PairedCase):
    async def until(self, phone, conn_id: str, count: int) -> list:
        for _ in range(300):
            got = received(phone.frames, conn_id)
            if len(got) >= count:
                return got
            await asyncio.sleep(0.03)
        return received(phone.frames, conn_id)

    async def test_websocket_over_real_peer(self) -> None:
        phone, answer = await self.pair(approve=True)
        await phone.connect(answer)
        phone.ch.send(ws_open("w1", "/ws?x=1", ["p2"], {"X-MyLAN-Host": "forged", "X-MyLAN-Protected": "0"}))
        self.assertEqual((await self.until(phone, "w1", 1))[0], ("accept", "p2"))
        for frame in (ws_text("w1", "ciao"), ws_bin("w1", bytes(range(256)) * 300), ws_text("w1", "headers")):
            phone.ch.send(frame)
        got = await self.until(phone, "w1", 4)
        self.assertEqual(got[1:3], [("text", "echo:ciao"), ("bin", bytes(range(256)) * 300)])
        h = {k.lower(): v for k, v in json.loads(got[3][1]).items()}
        self.assertEqual((h["x-mylan-host"], h["x-mylan-protected"]), (self.app["secret"], "1"))
        self.assertTrue(h["x-mylan-device"].startswith("mh_"))
        phone.ch.send(ws_text("w1", "close"))
        self.assertEqual((await self.until(phone, "w1", 5))[4], ("close", 4001, "bye"))
        phone.ch.send(ws_open("w2"))
        await self.until(phone, "w2", 1)
        phone.ch.send(ws_close("w2", 4003))
        for _ in range(100):
            if 4003 in fake_ws.CLOSED:
                break
            await asyncio.sleep(0.03)
        self.assertIn(4003, fake_ws.CLOSED)
        await self.runner.cleanup()
        phone.ch.send(ws_open("w3"))
        self.assertEqual(await self.until(phone, "w3", 1), [("close", 1011, "mylan_host_app_down")])


if __name__ == "__main__":
    unittest.main()
