"""`python -m host apps add <url> | list | remove <id>`: the apps MyLAN Host forwards to (data/apps.json)."""
import json
import sys

from host import apps
from host.i18n import t


def apps_command(args) -> int:
    if args.action == "list":
        print(json.dumps([apps.public_view(a) for a in apps.all_apps().values()], indent=1, ensure_ascii=False))
        return 0
    if not args.target:
        print(t("missing_target"), file=sys.stderr)
        return 2
    if args.action == "remove":
        ok = apps.remove(args.target)
        print(t("app_removed" if ok else "unknown_app", app=args.target))
        return 0 if ok else 1
    secret = sys.stdin.readline().strip() if args.secret_stdin else ""
    try:
        entry, new_secret = apps.add(args.target, args.id, args.protected, secret,
                                     args.secret_header, args.device_header)
    except ValueError as exc:
        print(t("app_unreachable", url=args.target, error=exc), file=sys.stderr)
        return 1
    print(t("app_added", app=entry["id"], name=entry["name"], url=entry["base_url"],
            protected=entry["protected"], header=entry["secret_header"]))
    if new_secret:  # shown once: the app stores it (or only its SHA-256) to recognize forwarded requests
        print(t("app_secret", header=entry["secret_header"], secret=entry["secret"]))
    return 0
