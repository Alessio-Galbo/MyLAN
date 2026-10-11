"""`python -m host run`: keeps one listener per live invite and per approved pairing, re-reading data/ every
SYNC_S seconds (invites and approvals made by the CLI, revocations). No port is opened: everything is outgoing."""
import asyncio
import logging

from host import devices, forward, invites, pairing, peers, returns
from host.i18n import t

SYNC_S = 2.0
log = logging.getLogger("mylan.host")


class Supervisor:
    def __init__(self, say=print) -> None:
        self.say = say
        self.invite_tasks: dict[str, asyncio.Task] = {}
        self.device_tasks: dict[str, asyncio.Task] = {}

    def _notify(self, code: str, app_id: str, meta: dict) -> None:
        who = " · ".join(v for k, v in meta.items() if v) or "?"
        self.say(t("pending_request", app=app_id, who=who, code=code))

    def _paired(self, device_id: str) -> None:
        self.say(t("paired", device=device_id))
        self._start_device(device_id, devices.active().get(device_id))

    def _start_device(self, device_id: str, dev: dict | None) -> None:
        token = devices.token_of(device_id, dev) if dev else None
        if token and device_id not in self.device_tasks:
            self.device_tasks[device_id] = asyncio.ensure_future(returns.listen(device_id, token))

    async def sync(self) -> None:
        for code, inv in invites.live().items():
            if code not in self.invite_tasks:
                self.invite_tasks[code] = asyncio.ensure_future(
                    pairing.listen(code, inv, notify=self._notify, on_paired=self._paired))
        for code in [c for c, task in self.invite_tasks.items() if task.done()]:
            self.invite_tasks.pop(code)
        active = devices.active()
        for device_id, dev in active.items():
            self._start_device(device_id, dev)
        for device_id in [d for d in self.device_tasks if d not in active or self.device_tasks[d].done()]:
            self.device_tasks.pop(device_id).cancel()
            if device_id not in active:
                await peers.close(device_id)  # revoked: the open link goes too

    async def stop(self) -> None:
        for task in [*self.invite_tasks.values(), *self.device_tasks.values()]:
            task.cancel()
        await asyncio.gather(*self.invite_tasks.values(), *self.device_tasks.values(), return_exceptions=True)
        await peers.close_all()
        await forward.close_session()


async def run(stop: asyncio.Event | None = None, say=print) -> None:
    sup, stop = Supervisor(say), stop or asyncio.Event()
    say(t("running"))
    try:
        while not stop.is_set():
            try:
                await sup.sync()
            except Exception:
                log.exception("MyLAN Host: sync failed")
            try:
                await asyncio.wait_for(stop.wait(), SYNC_S)
            except asyncio.TimeoutError:
                pass
    finally:
        await sup.stop()
