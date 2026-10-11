"""Command line of MyLAN Host: run, invite <app>, pending, approve|reject <code>, devices [revoke <id>], apps ..."""
import argparse
import asyncio
import json
import sys

from host import apps, devices, invites, pending
from host.cli_apps import apps_command
from host.i18n import t


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m host", description=t("cli_description"))
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("run", help=t("help_run"))
    inv = sub.add_parser("invite", help=t("help_invite"))
    inv.add_argument("app")
    inv.add_argument("--minutes", type=int, default=15)
    sub.add_parser("pending", help=t("help_pending"))
    for name in ("approve", "reject"):
        sub.add_parser(name, help=t(f"help_{name}")).add_argument("code")
    dev = sub.add_parser("devices", help=t("help_devices"))
    dev.add_argument("action", nargs="?", choices=["list", "revoke"], default="list")
    dev.add_argument("device_id", nargs="?")
    ap = sub.add_parser("apps", help=t("help_apps"))
    ap.add_argument("action", choices=["add", "list", "remove"])
    ap.add_argument("target", nargs="?")
    ap.add_argument("--id", default="")
    ap.add_argument("--protected", action="store_true")
    ap.add_argument("--secret-stdin", action="store_true", help=t("help_secret_stdin"))
    ap.add_argument("--secret-header", default="")
    ap.add_argument("--device-header", default="")
    return p


def _show(data) -> None:
    print(json.dumps(data, indent=1, ensure_ascii=False))


def main(argv: list[str]) -> int:
    args = _parser().parse_args(argv)
    if args.cmd == "run":
        from host.daemon import run
        try:
            asyncio.run(run())
        except KeyboardInterrupt:
            pass
        return 0
    if args.cmd == "invite":
        if not apps.get(args.app):
            print(t("unknown_app", app=args.app), file=sys.stderr)
            return 2
        inv = invites.create(args.app, args.minutes)
        print(t("invite_created", **inv))
        return 0
    if args.cmd == "pending":
        _show(pending.requests())
        return 0
    if args.cmd in ("approve", "reject"):
        ok = pending.decide(args.code, args.cmd == "approve")
        print(t("decided" if ok else "no_pending", code=args.code))
        return 0 if ok else 1
    if args.cmd == "devices":
        if args.action == "revoke":
            ok = bool(args.device_id) and devices.revoke(args.device_id)
            print(t("revoked" if ok else "unknown_device", device=args.device_id))
            return 0 if ok else 1
        _show({d: {k: v for k, v in dev.items() if not k.startswith("token")} for d, dev in devices.active().items()})
        return 0
    return apps_command(args)
