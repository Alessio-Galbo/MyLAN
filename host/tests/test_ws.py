"""WebSocket tunnel (APP_SPEC §4.4) on a recording channel against the fake app's /ws: open with subprotocol, echo of
text and binary, long messages in parts both ways, header injection, close by the app and by the phone."""
import asyncio
import json
import unittest

from host.tests import fake_ws
from host.tests.ws_case import TunnelCase
from host.tests.ws_helpers import received, ws_bin, ws_close, ws_open, ws_text


class WsTunnelTest(TunnelCase):
    async def test_echo_text_binary_and_parts(self) -> None:
        self.send(ws_open("w1"))
        self.assertEqual((await self.until("w1", 1))[0], ("accept", "p1"))
        self.send(ws_text("w1", "ciao"), ws_bin("w1", bytes([1, 2, 250])), ws_text("w1", "a" * 9000, True),
                  ws_text("w1", "b"), ws_text("w1", "big"))
        got = await self.until("w1", 5)
        self.assertEqual(got[1:4], [("text", "echo:ciao"), ("bin", bytes([1, 2, 250])), ("text", "echo:" + "a" * 9000 + "b")])
        self.assertEqual(got[4], ("text", "x" * 20000))
        self.assertTrue(all(len(f) < 65536 for f in self.ch.channel.sent))

    async def test_headers_injected_and_phone_copies_stripped(self) -> None:
        self.send(ws_open("w2", hdrs={"X-MyLAN-Host": "forged", "x-mylan-device": "evil", "Sec-WebSocket-Key": "x",
                                      "x-custom": "1"}), ws_text("w2", "headers"))
        h = {k.lower(): v for k, v in json.loads((await self.until("w2", 2))[1][1]).items()}
        self.assertEqual((h["x-mylan-host"], h["x-mylan-device"], h["x-mylan-protected"]),
                         (self.app["secret"], "mh_test", "1"))
        self.assertEqual(h["x-custom"], "1")
        self.assertNotEqual(h["sec-websocket-key"], "x")

    async def test_close_by_app_and_by_phone(self) -> None:
        self.send(ws_open("w3"), ws_text("w3", "close"))
        self.assertEqual((await self.until("w3", 2))[1], ("close", 4001, "bye"))
        self.send(ws_open("w4"))
        await self.until("w4", 1)
        self.send(ws_close("w4", 4002))
        for _ in range(100):
            if 4002 in fake_ws.CLOSED and not self.ch.server.sockets:
                break
            await asyncio.sleep(0.02)
        self.assertIn(4002, fake_ws.CLOSED)
        self.assertEqual(received(self.ch.channel.sent, "w4"), [("accept", "p1")])  # no answer to the phone's close


if __name__ == "__main__":
    unittest.main()
