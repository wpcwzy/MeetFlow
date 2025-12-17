import os
from functools import lru_cache


class Settings:
    """Centralised application configuration."""

    livekit_url: str
    livekit_public_url: str
    livekit_api_key: str
    livekit_api_secret: str

    def __init__(self):
        self.livekit_url = os.getenv("LIVEKIT_URL", "ws://127.0.0.1:7880")
        self.livekit_public_url = os.getenv("LIVEKIT_PUBLIC_URL", "ws://127.0.0.1:7880")
        self.livekit_api_key = os.getenv("LIVEKIT_API_KEY", "")
        self.livekit_api_secret = os.getenv("LIVEKIT_API_SECRET", "")

    @property
    def livekit_configured(self) -> bool:
        return bool(self.livekit_api_key and self.livekit_api_secret)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
