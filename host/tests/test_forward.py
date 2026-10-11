"""Forwarding of DataChannel requests to a fake local app: bytes untouched, Host headers injected and phone copies
stripped, protected flag, unknown app 404, app down 503, chunked uploads, media channel binary frames."""
import asyncio
import base64
import json
import os
import unittest

from host import apps, forward
from host.tests import fake_app, fakes


class ForwardTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        fakes.isolate(self)
        self.runner, self.base = await fake_app.start_app()
        self.app, _ = await asyncio.to_thread(apps.add, self.base, "", True)

    async def asyncTearDown(self) -> None:
        await forward.close_session()
        await self.runner.cleanup()

    async def ask(self, msg: dict, app_id: str = "", label: str = "mylan-api", extra: list = ()) -> tuple[dict, bytes]:
        ch = fakes.channel_server(label, app_id or self.app["id"])
        ch.server.on_message(json.dumps({"id": "r1", **msg}))
        for frame in extra:
            ch.server.on_message(frame)
        for _ in range(200):
            await asyncio.sleep(0.02)
            if not ch.server.tasks and not ch.server.uploads:
                break
        return fakes.response(ch.channel.sent, "r1")

    async def test_body_byte_identical_both_ways(self) -> None:
        raw = os.urandom(40_000)
        start, body = await self.ask({"method": "POST", "path": "/echo?a=1&b=%20", "headers": {"content-type": "x/y"},
                                      "body": base64.b64encode(raw).decode()})
        got = json.loads(body)
        self.assertEqual(start["status"], 200)
        self.assertEqual(base64.b64decode(got["body_b64"]), raw)
        self.assertEqual(got["path"], "/echo?a=1&b=%20")
        start, body = await self.ask({"method": "GET", "path": "/blob/300000"}, label="mylan-media")
        self.assertEqual(body, bytes(i % 251 for i in range(300000)))
        self.assertEqual(start["headers"]["content-encoding"], "gzip")  # never decompressed on the way

    async def test_headers_injected_and_phone_copies_stripped(self) -> None:
        sent = {"X-MyLAN-Host": "forged", "x-mylan-device": "evil", "X-MyLAN-Protected": "0", "X-Forwarded-For": "1.2.3.4",
                "Host": "evil.example", "x-device-id": "dev_phone", "Accept": "text/plain"}
        _, body = await self.ask({"method": "GET", "path": "/echo", "headers": sent})
        h = {k.lower(): v for k, v in json.loads(body)["headers"].items()}
        self.assertEqual(h["x-mylan-host"], self.app["secret"])
        self.assertEqual(h["x-mylan-device"], "mh_test")
        self.assertEqual(h["x-mylan-protected"], "1")
        self.assertNotIn("x-forwarded-for", h)
        self.assertTrue(h["host"].startswith("127.0.0.1:"))
        self.assertEqual((h["x-device-id"], h["accept"]), ("dev_phone", "text/plain"))

    async def test_custom_header_names_and_unprotected(self) -> None:
        app, _ = await asyncio.to_thread(apps.add, self.base, "hub", False, "s3cret", "X-Hub-Bridge", "X-Hub-Device")
        _, body = await self.ask({"method": "GET", "path": "/echo", "headers": {"x-hub-bridge": "forged"}}, app["id"])
        h = {k.lower(): v for k, v in json.loads(body)["headers"].items()}
        self.assertEqual((h["x-hub-bridge"], h["x-hub-device"], h["x-mylan-protected"]), ("s3cret", "mh_test", "0"))

    async def test_unknown_app_404_and_app_down_503(self) -> None:
        start, _ = await self.ask({"method": "GET", "path": "/echo"}, app_id="nope")
        self.assertEqual((start["status"], start["headers"]["x-mylan-host-reason"]), (404, "mylan_host_unknown_app"))
        await self.runner.cleanup()
        start, _ = await self.ask({"method": "GET", "path": "/echo"})
        self.assertEqual((start["status"], start["headers"]["x-mylan-host-reason"]), (503, "mylan_host_app_down"))

    async def test_chunked_upload(self) -> None:
        raw = os.urandom(150_000)
        frames = [bytes([0x42, 2, 1 if i + 60000 < len(raw) else 0]) + b"r1" + raw[i:i + 60000]
                  for i in range(0, len(raw), 60000)]
        _, body = await self.ask({"method": "PUT", "path": "/echo", "body": "", "body_chunked": True,
                                  "body_size": len(raw)}, extra=frames)
        self.assertEqual(base64.b64decode(json.loads(body)["body_b64"]), raw)

    async def test_bad_requests(self) -> None:
        start, _ = await self.ask({"method": "TRACE", "path": "/echo"})
        self.assertEqual(start["status"], 405)
        start, _ = await self.ask({"method": "GET", "path": "//evil.example/x"})
        self.assertEqual(start["status"], 400)


if __name__ == "__main__":
    unittest.main()
