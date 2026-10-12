"""WebSocket endpoint of the fake app (/ws): echoes text and binary; "headers" -> the request headers as JSON,
"protocol" -> the chosen subprotocol, "big" -> 20000 characters, "close" -> closes with 4001 "bye". The close code
of each connection closed by the client is kept in CLOSED."""
import json

from aiohttp import WSMsgType, web

CLOSED: list = []


async def ws(req: web.Request) -> web.WebSocketResponse:
    sock = web.WebSocketResponse(protocols=("p1", "p2"))
    await sock.prepare(req)
    async for msg in sock:
        if msg.type == WSMsgType.BINARY:
            await sock.send_bytes(msg.data)
        elif msg.data == "headers":
            await sock.send_str(json.dumps(dict(req.headers)))
        elif msg.data == "protocol":
            await sock.send_str(str(sock.ws_protocol))
        elif msg.data == "big":
            await sock.send_str("x" * 20000)
        elif msg.data == "close":
            await sock.close(code=4001, message=b"bye")
            return sock
        else:
            await sock.send_str("echo:" + msg.data)
    CLOSED.append(sock.close_code)
    return sock


async def refuse(req: web.Request) -> web.Response:
    return web.Response(status=403)
