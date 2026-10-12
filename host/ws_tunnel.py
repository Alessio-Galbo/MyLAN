"""WebSocket tunnel of MyLAN Host (APP_SPEC §4.4): `ws-open` on the DataChannel opens a WebSocket to the app's local
URL (path and subprotocols from the message) with the same injected headers as the HTTP forwarding; `ws-msg` and
`ws-close` are relayed both ways (ws_conn.py, ws_inbound.py). Only for apps declaring "websocket": true; the
refusals in ws_policy.py; app down 1011, upgrade refused by the app 1008; the channel closing ends all of its sockets
(1001 to the app). Adapted from FaMiLAN backend/app/services/remote/webrtc_ws_bridge.py."""
import asyncio
import json

import aiohttp
from yarl import URL

from host import apps, forward, frames, headers, ws_inbound, ws_policy
from host.ws_conn import WsConn, close_code

TYPES = ("ws-open", "ws-msg", "ws-close")
OPEN_TIMEOUT_S, CANCEL_AFTER_S, MAX_APP_MESSAGE = 15.0, 5.0, 4 * 1024 * 1024
_COUNT: dict[str, int] = {}


def handle(server, conn_id: str, msg: dict) -> None:
    """One ws-* frame of the ChannelServer `server` (its .sockets holds the open connections)."""
    conn, kind = server.sockets.get(conn_id), msg.get("type")
    if kind == "ws-open" and not conn:
        _open(server, conn_id, msg)
    elif conn and kind == "ws-msg":
        ws_inbound.feed(conn, msg)
    elif conn and kind == "ws-close":
        conn.shut(close_code(msg.get("code")), tell=False)  # closed by the phone: no answer


def _open(server, conn_id: str, msg: dict) -> None:
    refusal = ws_policy.refusal(server, msg, _COUNT.get(server.device_id, 0))
    if refusal:
        frames.safe_send(server.channel, json.dumps({"type": "ws-close", "id": conn_id, "code": refusal[0],
                                                     "reason": refusal[1]}))
        return
    app = apps.get(server.app_id)
    url = URL("ws" + app["base_url"][4:] + msg["path"], encoded=True)  # http -> ws, https -> wss
    out = {k: v for k, v in headers.outgoing(msg.get("headers"), app, server.device_id).items()
           if not k.lower().startswith("sec-websocket-")}
    conn = server.sockets[conn_id] = WsConn(server.channel, conn_id)
    _COUNT[server.device_id] = _COUNT.get(server.device_id, 0) + 1
    conn.task = asyncio.get_running_loop().create_task(_run(server, conn, url, out, msg.get("protocols") or []))


async def _run(server, conn: WsConn, url: URL, out: dict, protocols: list) -> None:
    try:
        try:
            ws = await asyncio.wait_for(forward._session().ws_connect(
                url, headers=out, protocols=protocols, max_msg_size=MAX_APP_MESSAGE, autoping=True), OPEN_TIMEOUT_S)
        except aiohttp.WSServerHandshakeError:
            return conn.shut(1008, "mylan_host_ws_refused")
        except (aiohttp.ClientError, OSError, asyncio.TimeoutError):
            return conn.shut(1011, "mylan_host_app_down")
        conn.ws = ws
        if not conn.closed:
            conn.frame("ws-accept", protocol=ws.protocol)
        await conn.pump()
    finally:
        server.sockets.pop(conn.id, None)
        _COUNT[server.device_id] = _COUNT.get(server.device_id, 1) - 1
        if _COUNT[server.device_id] <= 0:
            _COUNT.pop(server.device_id, None)


def close_all(server) -> None:
    """The channel closed: every socket of it is closed towards the app (1001); tasks still alive later are stopped."""
    for conn in list(server.sockets.values()):
        conn.shut(1001, tell=False)
        if conn.task and not conn.task.done():
            asyncio.get_running_loop().call_later(CANCEL_AFTER_S, conn.task.cancel)
