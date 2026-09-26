"""Settings of the SIRA community service (accounts, community fares).

Every secret comes from the environment. Nothing sensitive has a default:
in development a throwaway signing key is generated at start-up.
"""

from __future__ import annotations

import os
import secrets
import warnings
from dataclasses import dataclass, field


def _bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    return default if value is None else value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    environment: str = field(default_factory=lambda: os.getenv("SIRA_ENV", "development"))
    database_url: str = field(default_factory=lambda: os.getenv("COMMUNITY_DATABASE_URL", "sqlite:///./services/community/data/community.db"))
    jwt_secret: str = field(default_factory=lambda: os.getenv("COMMUNITY_JWT_SECRET", ""))
    # 30 days, then the SMS code is asked again (as in Orange Max it).
    token_ttl_minutes: int = field(default_factory=lambda: int(os.getenv("COMMUNITY_TOKEN_TTL_MINUTES", str(60 * 24 * 30))))
    # Orange Developer API (SMS). Without credentials, codes are only logged.
    orange_client_id: str = field(default_factory=lambda: os.getenv("ORANGE_CLIENT_ID", ""))
    orange_client_secret: str = field(default_factory=lambda: os.getenv("ORANGE_CLIENT_SECRET", ""))
    orange_sender_address: str = field(default_factory=lambda: os.getenv("ORANGE_SENDER_ADDRESS", ""))
    # Demo mode returns the code in the API response so a demo works without SMS.
    otp_demo: bool = field(default_factory=lambda: _bool("COMMUNITY_OTP_DEMO", os.getenv("SIRA_ENV", "development") == "development"))

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def sms_enabled(self) -> bool:
        return bool(self.orange_client_id and self.orange_client_secret and self.orange_sender_address)


def load_settings() -> Settings:
    settings = Settings()
    if not settings.jwt_secret:
        if settings.is_production:
            raise RuntimeError("COMMUNITY_JWT_SECRET est obligatoire en production.")
        warnings.warn("COMMUNITY_JWT_SECRET absent : clé temporaire générée (sessions perdues au redémarrage).")
        object.__setattr__(settings, "jwt_secret", secrets.token_urlsafe(48))
    if settings.is_production and settings.otp_demo:
        raise RuntimeError("COMMUNITY_OTP_DEMO doit être désactivé en production.")
    return settings


settings = load_settings()
