"""Fake local app for the tests (aiohttp on 127.0.0.1, free port): echo, binary blob, WebSocket, MyLAN descriptor."""
import base64

from aiohttp import web

from host.tests import fake_ws


async def start_app() -> tuple[web.AppRunner, str]:
    """Fake local app on 127.0.0.1:<free port>: /echo returns {method, path, headers, body_b64}; /blob/<n> n bytes."""
    async def echo(req: web.Request) -> web.Response:
        raw = await req.read()
        return web.json_response({"method": req.method, "path": req.path_qs, "headers": dict(req.headers),
                                  "body_b64": base64.b64encode(raw).decode()})

    async def blob(req: web.Request) -> web.Response:
        n = int(req.match_info["n"])
        return web.Response(body=bytes(i % 251 for i in range(n)), headers={"Content-Encoding": "gzip",
                                                                            "Content-Type": "application/x-test"})

    async def descriptor(req: web.Request) -> web.Response:
        return web.json_response({"name": "Fake App", "short_name": "Fake", "chunked_uploads": True,
                                  "websocket": True})

    app = web.Application(client_max_size=64 * 1024 * 1024)
    app.router.add_route("*", "/echo{tail:.*}", echo)
    app.router.add_get("/blob/{n}", blob)
    app.router.add_get("/.well-known/mylan.json", descriptor)
    app.router.add_get("/ws", fake_ws.ws)
    app.router.add_get("/ws-refused", fake_ws.refuse)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    port = site._server.sockets[0].getsockname()[1]
    return runner, f"http://127.0.0.1:{port}"
