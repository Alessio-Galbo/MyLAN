"""Which `ws-open` the Host refuses (APP_SPEC §4.4) and with which close code: unknown app, app not declaring
"websocket": true, bad path or headers, bad subprotocols (1008); too many sockets for the pairing (1013)."""
import re

from host import apps, forward

MAX_PER_DEVICE = 8
TOKEN = re.compile(r"^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,64}$")


def refusal(server, msg: dict, open_count: int) -> tuple[int, str] | None:
    app = apps.get(server.app_id)
    protocols = msg.get("protocols") or []
    if not app:
        return 1008, "mylan_host_unknown_app"
    if not (app.get("descriptor") or {}).get("websocket"):
        return 1008, "mylan_host_no_websocket"
    issue = forward.request_problem({**msg, "method": "GET"})
    if issue:
        return 1008, issue[1]
    if not isinstance(protocols, list) or len(protocols) > 16 or not all(isinstance(p, str) and TOKEN.match(p)
                                                                         for p in protocols):
        return 1008, "mylan_host_bad_protocols"
    if open_count >= MAX_PER_DEVICE:
        return 1013, "mylan_host_busy"
    return None
