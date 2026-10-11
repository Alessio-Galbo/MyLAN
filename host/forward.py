"""One DataChannel request -> the app's local HTTP server -> streamed back on the same channel. Body bytes untouched
both ways (no automatic decompression, no redirects). App missing 404, app not answering 503, no start in 120 s 504."""
import asyncio
import json
import logging

import aiohttp
from yarl import URL

from host import apps, frames, headers

log = logging.getLogger("mylan.host")
METHODS = {"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}
START_TIMEOUT_S, MAX_PATH = 120.0, 4096
SKIP_AUTO = ("User-Agent", "Accept-Encoding", "Accept", "Content-Type")
_SESSION: dict = {}


def _session() -> aiohttp.ClientSession:
    loop = asyncio.get_running_loop()
    s = _SESSION.get(loop)
    if s is None or s.closed:
        s = _SESSION[loop] = aiohttp.ClientSession(auto_decompress=False, cookie_jar=aiohttp.DummyCookieJar(),
                                                   timeout=aiohttp.ClientTimeout(total=None, sock_connect=5))
    return s


async def close_session() -> None:
    s = _SESSION.pop(asyncio.get_running_loop(), None)
    if s:
        await s.close()


def request_problem(msg: dict) -> tuple[int, str] | None:
    path = msg.get("path", "/")
    if str(msg.get("method", "GET")).upper() not in METHODS:
        return 405, "mylan_host_bad_method"
    if not isinstance(path, str) or not path.startswith("/") or path.startswith("//"):
        return 400, "mylan_host_bad_path"
    if len(path) > MAX_PATH:
        return 414, "mylan_host_path_too_long"
    return headers.problem(msg.get("headers"))


async def forward(app_id: str, device_id: str, msg: dict, body: bytes, channel, req_id: str,
                  abort: asyncio.Event) -> None:
    app = apps.get(app_id)
    issue = (404, "mylan_host_unknown_app") if not app else request_problem(msg)
    if issue:
        frames.reply_status(channel, req_id, *issue)
        return
    method = str(msg.get("method", "GET")).upper()
    url = URL(app["base_url"] + msg["path"], encoded=True)
    out = headers.outgoing(msg.get("headers"), app, device_id)
    try:
        data = body if body or method not in ("GET", "HEAD") else None
        resp = await asyncio.wait_for(_session().request(method, url, headers=out, data=data, allow_redirects=False,
                                                         skip_auto_headers=SKIP_AUTO), START_TIMEOUT_S)
    except asyncio.TimeoutError:
        frames.reply_status(channel, req_id, 504, "mylan_host_app_timeout")
        return
    except (aiohttp.ClientError, OSError):
        frames.reply_status(channel, req_id, 503, "mylan_host_app_down")
        return
    done = False
    try:
        if abort.is_set() or not frames.send_start(channel, req_id, resp.status, headers.incoming(resp.headers)):
            return
        async for part in resp.content.iter_chunked(frames.CHUNK):
            await frames.send_body(channel, req_id, part, True, abort)
            if abort.is_set():
                return
        await frames.send_body(channel, req_id, b"", False, abort)
        done = True
    except (aiohttp.ClientError, OSError, asyncio.TimeoutError):
        log.warning("MyLAN Host: response of %s %s broken", method, msg.get("path"))
        frames.safe_send(channel, json.dumps({"id": req_id, "type": "error", "error": "mylan_host_app_broken"}))
    finally:
        resp.release() if done else resp.close()  # close: also stops a stream the phone aborted
