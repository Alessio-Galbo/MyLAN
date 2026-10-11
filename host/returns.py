"""Return visits of approved phones (INTEGRATION §5.7): one listener per pairing on the topics derived from its
reconnect token; each offer must carry a fresh nonce (echoed in the answer). Adapted from FaMiLAN
remote_return_service.py and return_answer.py."""
import time
from collections import OrderedDict

from host import crypto, devices, offer, peers, relay

MAX_NONCES, NONCE_LEN = 256, (4, 64)


def fresh_nonce(seen: OrderedDict, nonce) -> bool:
    if not isinstance(nonce, str) or not NONCE_LEN[0] <= len(nonce) <= NONCE_LEN[1] or nonce in seen:
        return False
    seen[nonce] = None
    while len(seen) > MAX_NONCES:
        seen.popitem(last=False)
    return True


async def listen(device_id: str, token: str, poll_timeout: float = 60.0) -> None:
    """Runs until cancelled or the pairing is revoked."""
    topic_offer = crypto.return_topic(token, "reconnect-offer")
    topic_answer = crypto.return_topic(token, "reconnect-answer")
    key, seen, since = crypto.return_key(token), OrderedDict(), int(time.time()) - 15
    while True:
        msg = await relay.receive(topic_offer, key, timeout=poll_timeout, since=str(since))
        if not offer.is_offer(msg) or not fresh_nonce(seen, msg.get("nonce")):
            continue  # nothing, an old offer read again, or a replay
        since = int(time.time()) - 2
        dev = devices.active().get(device_id)
        if not dev:
            return
        sdp = await peers.answer(peers.create(dev["app"], device_id), msg["sdp"])
        await relay.send(topic_answer, key, {"type": "answer", "sdp": sdp, "nonce": msg["nonce"]})
