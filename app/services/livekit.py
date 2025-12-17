import json
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from jose import jwt
from livekit import api

from app.config import get_settings


class LiveKitConfigurationError(RuntimeError):
    """Raised when LiveKit credentials are not configured."""


def _base_grant(room_name: str, is_host: bool) -> Dict[str, Any]:
    grant: Dict[str, Any] = {
        "roomJoin": True,
        "room": room_name,
        "canPublish": True,
        "canSubscribe": True,
        "canPublishData": True,
        "canPublishSources": ["camera", "microphone", "screen_share"],
    }
    if is_host:
        grant["roomCreate"] = True
    return grant


def create_livekit_token(
    *,
    identity: str,
    name: str,
    room_name: str,
    is_host: bool,
    metadata: Optional[Dict[str, Any]] = None,
    ttl_minutes: int = 240,
) -> str:
    """Create a LiveKit access token using shared secret credentials."""
    settings = get_settings()
    if not settings.livekit_configured:
        raise LiveKitConfigurationError("LiveKit credentials are not configured.")

    now = datetime.utcnow()
    expiration = now + timedelta(minutes=ttl_minutes)

    payload: Dict[str, Any] = {
        "iss": settings.livekit_api_key,
        "sub": identity,
        "name": name,
        "nbf": int(now.timestamp()) - 10,
        "exp": int(expiration.timestamp()),
        "video": _base_grant(room_name, is_host),
    }

    if metadata:
        payload["metadata"] = json.dumps(metadata)

    return jwt.encode(payload, settings.livekit_api_secret, algorithm="HS256")

