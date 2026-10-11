"""Approval of a new phone between the running Host and the CLI, one file each (no shared file, no race): the Host
writes data/pending/<CODE>.json (who is asking), `host approve|reject <code>` writes <CODE>.decision."""
import asyncio
import json
import time

from host import crypto, store


def _dir():
    path = store.data_dir() / "pending"
    path.mkdir(parents=True, exist_ok=True)
    return path


def open_request(code: str, app_id: str, meta: dict) -> None:
    code = crypto.normalize_code(code)
    (_dir() / f"{code}.decision").unlink(missing_ok=True)
    store.write_json(f"pending/{code}.json", {"code": code, "app": app_id, "meta": meta, "at": int(time.time())})


def close_request(code: str) -> None:
    code = crypto.normalize_code(code)
    for suffix in (".json", ".decision"):
        (_dir() / f"{code}{suffix}").unlink(missing_ok=True)


def requests() -> list[dict]:
    out = []
    for f in sorted(_dir().glob("*.json")):
        try:
            out.append(json.loads(f.read_text(encoding="utf-8")))
        except (OSError, ValueError):
            pass
    return out


def decide(code: str, approve: bool) -> bool:
    """False when no phone is waiting on that code."""
    code = crypto.normalize_code(code)
    if not (_dir() / f"{code}.json").exists():
        return False
    (_dir() / f"{code}.decision").write_text("approve" if approve else "reject", encoding="ascii")
    return True


async def wait_decision(code: str, timeout: float, poll: float = 0.5) -> bool:
    """True only for an explicit approval before the timeout."""
    path = _dir() / f"{crypto.normalize_code(code)}.decision"
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if path.exists():
            return path.read_text(encoding="ascii").strip() == "approve"
        await asyncio.sleep(poll)
    return False
