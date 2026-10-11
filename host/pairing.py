"""First pairing through an invite (INTEGRATION §5, protocol 2): wait for the phone's offer on the invite topics,
ask the PC user (pending.py), then answer with SDP + reconnect token, or refuse. The device id is chosen by the
Host, never by the phone. Adapted from FaMiLAN signaling_listener.py and signaling_accept.py."""
import asyncio
import time

from host import apps, crypto, devices, invites, offer, peers, pending, relay

APPROVAL_TIMEOUT = 180.0  # the phone waits 180 s for the answer


async def _refuse(keys: crypto.InviteKeys, reason: str) -> None:
    await relay.send(keys.topic_answer, keys.answer_key, {"type": "rejected", "reason": reason})


async def _handle(code: str, app_id: str, msg: dict, keys: crypto.InviteKeys, deadline: float, notify) -> str | None:
    if not apps.get(app_id):
        await _refuse(keys, "expired")
        return None
    meta = offer.meta(msg)
    pending.open_request(code, app_id, meta)
    notify(code, app_id, meta)
    try:
        approved = await pending.wait_decision(code, max(1.0, min(APPROVAL_TIMEOUT, deadline - time.time())))
    finally:
        pending.close_request(code)
    if not approved:
        invites.redeem(code)  # a refused invite is spent
        await _refuse(keys, "declined")
        return None
    if not invites.redeem(code):
        await _refuse(keys, "expired")
        return None
    device_id, token = devices.add(app_id, meta)
    sdp = await peers.answer(peers.create(app_id, device_id), msg["sdp"])
    await relay.send(keys.topic_answer, keys.answer_key, {"type": "answer", "sdp": sdp, "reconnect_token": token})
    return device_id


async def listen(code: str, invite: dict, notify=lambda *a: None, on_paired=lambda d: None) -> None:
    """Until the invite expires or one offer has been handled."""
    keys = await asyncio.to_thread(crypto.invite_keys, code)
    deadline = float(invite.get("expires_at", 0))
    while time.time() < deadline:
        msg = await relay.receive(keys.topic_offer, keys.offer_key, timeout=max(1.0, min(30.0, deadline - time.time())))
        if offer.is_offer(msg):
            device_id = await _handle(code, invite["app"], msg, keys, deadline, notify)
            if device_id:
                on_paired(device_id)
            return
