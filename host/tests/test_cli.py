"""CLI of MyLAN Host on an isolated data dir: apps add/list/remove, invite, approve without a waiting phone,
devices revoke; the secret never appears in `apps list`."""
import contextlib
import io
import json
import unittest
from unittest import mock

from host import apps, cli, devices
from host.tests import fakes

DESC = {"name": "Fake App", "short_name": "Fake"}


def run(*argv) -> tuple[int, str]:
    out = io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
        code = cli.main(list(argv))
    return code, out.getvalue()


class CliTest(unittest.TestCase):
    def setUp(self) -> None:
        fakes.isolate(self)

    def test_apps_cycle(self) -> None:
        with mock.patch("host.descriptor.fetch", return_value=DESC):
            code, out = run("apps", "add", "http://127.0.0.1:9/", "--protected")
        self.assertEqual(code, 0)
        secret = apps.get("fake")["secret"]
        self.assertIn(secret, out)  # shown once, at creation
        code, out = run("apps", "list")
        self.assertNotIn(secret, out)
        self.assertEqual(json.loads(out)[0]["base_url"], "http://127.0.0.1:9")
        self.assertEqual(run("apps", "remove", "fake")[0], 0)
        self.assertEqual(run("apps", "remove", "fake")[0], 1)

    def test_secret_from_stdin_and_bad_url(self) -> None:
        with mock.patch("host.descriptor.fetch", return_value=DESC), mock.patch("sys.stdin", io.StringIO("given\n")):
            code, out = run("apps", "add", "http://127.0.0.1:9", "--id", "hub", "--secret-stdin")
        self.assertEqual((code, apps.get("hub")["secret"]), (0, "given"))
        self.assertNotIn("given", out)
        self.assertEqual(run("apps", "add", "ftp://x")[0], 1)

    def test_invite_and_approve(self) -> None:
        self.assertEqual(run("invite", "nope")[0], 2)
        with mock.patch("host.descriptor.fetch", return_value=DESC):
            run("apps", "add", "http://127.0.0.1:9")
        code, out = run("invite", "fake")
        self.assertEqual(code, 0)
        self.assertIn("https://example.test/MyLAN/#i=", out)
        self.assertIn("&p=2", out)
        self.assertEqual(run("approve", "AAAA-BBBB-CCCC")[0], 1)

    def test_devices_revoke(self) -> None:
        device_id, token = devices.add("fake", {"os": "Test"})
        self.assertEqual(devices.token_of(device_id, devices.active()[device_id]), token)
        self.assertNotIn(token, run("devices")[1])
        self.assertEqual(run("devices", "revoke", device_id)[0], 0)
        self.assertEqual(devices.active(), {})


if __name__ == "__main__":
    unittest.main()
