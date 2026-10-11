"""What a phone's offer says about itself, cleaned for display (approval prompt, device list): short text only. The
IP shown is the srflx candidate of the SDP; nothing here ever decides access. From FaMiLAN offer_meta.py."""
import re

TEXT_FIELDS = ("device_type", "browser", "os", "screen", "name", "model", "platform")
MAX_LEN = 160
_SRFLX = re.compile(r"a=candidate:\S+\s+\d+\s+\S+\s+\d+\s+([0-9.]+)\s+\d+\s+typ\s+srflx")


def meta(offer: dict) -> dict:
    raw = offer.get("meta") if isinstance(offer.get("meta"), dict) else {}
    out = {k: str(raw[k])[:MAX_LEN] for k in TEXT_FIELDS if raw.get(k) not in (None, "")}
    found = _SRFLX.search(str(offer.get("sdp", "")))
    out["ip"] = found.group(1) if found else ""
    return out


def is_offer(msg) -> bool:
    return isinstance(msg, dict) and msg.get("type") == "offer" and isinstance(msg.get("sdp"), str)
