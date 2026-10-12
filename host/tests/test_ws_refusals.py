"""WebSocket tunnel refusals and endings: upgrade refused by the app, bad path or subprotocols, app without
"websocket": true (1008), too many sockets for a pairing (1013), channel closed (1001 to the app), app down (1011)."""
import asyncio
import unittest

from host import apps, store, ws_policy
from host.tests import fake_ws, fakes
from host.tests.ws_case import TunnelCase
from host.tests.ws_helpers import received, ws_open


class WsRefusalTest(TunnelCase):
    async def test_refusals_and_app_down(self) -> None:
        self.send(ws_open("w5", "/ws-refused"), ws_open("w6", "//evil/ws"), ws_open("w7", protocols=["a b"]))
        self.assertEqual((await self.until("w5", 1))[0][:2], ("close", 1008))
        self.assertEqual(received(self.ch.channel.sent, "w6")[0][:2], ("close", 1008))
        self.assertEqual(received(self.ch.channel.sent, "w7")[0][:2], ("close", 1008))
        for i in range(ws_policy.MAX_PER_DEVICE + 1):
            self.send(ws_open(f"m{i}"))
        self.assertEqual((await self.until(f"m{ws_policy.MAX_PER_DEVICE}", 1))[0][:2], ("close", 1013))
        self.ch.server.close()  # channel closed: every socket closed towards the app (1001)
        for _ in range(100):
            if fake_ws.CLOSED.count(1001) >= ws_policy.MAX_PER_DEVICE:
                break
            await asyncio.sleep(0.02)
        self.assertGreaterEqual(fake_ws.CLOSED.count(1001), ws_policy.MAX_PER_DEVICE)
        await self.runner.cleanup()
        down = fakes.channel_server("mylan-api", self.app["id"])
        down.server.on_message(ws_open("w8"))
        self.assertEqual(await self.until("w8", 1, down.channel), [("close", 1011, "mylan_host_app_down")])

    async def test_app_without_websocket_flag(self) -> None:
        entry = apps.all_apps()
        entry[self.app["id"]]["descriptor"].pop("websocket")
        store.write_json(apps.FILE, entry)
        self.send(ws_open("w9"))
        self.assertEqual(received(self.ch.channel.sent, "w9"), [("close", 1008, "mylan_host_no_websocket")])


if __name__ == "__main__":
    unittest.main()
