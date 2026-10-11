"""WebRTC peers of MyLAN Host (aiortc): one RTCPeerConnection per approved (phone, app) pairing, each DataChannel
served by a ChannelServer bound to that app. A new connection of the same pairing replaces the old one. Adapted
from FaMiLAN backend/app/services/remote/webrtc_peer.py and webrtc_manager.py (no fixed UDP port / UPnP yet)."""
import asyncio

from aiortc import RTCConfiguration, RTCIceServer, RTCPeerConnection, RTCSessionDescription

from host import store
from host.channel import ChannelServer

_PEERS: dict[str, RTCPeerConnection] = {}
_BG: set = set()


def _bg(coro) -> None:
    task = asyncio.ensure_future(coro)
    _BG.add(task)
    task.add_done_callback(_BG.discard)


def _ice() -> list:
    urls = [u for u in store.config().get("ice_servers", []) if isinstance(u, str)]
    return [RTCIceServer(urls=u) for u in urls]


def create(app_id: str, device_id: str) -> RTCPeerConnection:
    pc = RTCPeerConnection(RTCConfiguration(iceServers=_ice()))

    @pc.on("datachannel")
    def on_datachannel(channel) -> None:
        server = ChannelServer(channel, app_id, device_id)
        channel.on("message", server.on_message)
        channel.on("close", server.close)

    @pc.on("connectionstatechange")
    def on_state() -> None:
        if pc.connectionState in ("closed", "failed") and _PEERS.get(device_id) is pc:
            _PEERS.pop(device_id, None)

    old = _PEERS.pop(device_id, None)
    if old:
        _bg(old.close())
    _PEERS[device_id] = pc
    return pc


async def answer(pc: RTCPeerConnection, offer_sdp: str) -> str:
    """Complete answer SDP (no trickle ICE): wait for gathering, at most 5 s."""
    await pc.setRemoteDescription(RTCSessionDescription(sdp=offer_sdp, type="offer"))
    await pc.setLocalDescription(await pc.createAnswer())
    for _ in range(50):
        if pc.iceGatheringState == "complete":
            break
        await asyncio.sleep(0.1)
    return pc.localDescription.sdp


async def close(device_id: str) -> None:
    pc = _PEERS.pop(device_id, None)
    if pc:
        await pc.close()


async def close_all() -> None:
    for device_id in list(_PEERS):
        await close(device_id)


def connected() -> list[str]:
    return [d for d, pc in _PEERS.items() if pc.connectionState == "connected"]
