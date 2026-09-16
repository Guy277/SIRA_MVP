from pydantic_settings import BaseSettings
from typing import List, Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "SIRA Backend API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = "sira_super_secret_jwt_key_abidjan_2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 jours
    DATABASE_URL: str = "sqlite:///./sira.db"

    # Supabase credentials
    SUPABASE_URL: Optional[str] = "https://kmfukfzsdvkjskztrhzb.supabase.co"
    SUPABASE_KEY: Optional[str] = "sb_publishable_I7GyLw2P3TXKhV02-byztg_hgBuhKn_"
    SUPABASE_PROJECT_REF: Optional[str] = "kmfukfzsdvkjskztrhzb"

    ORANGE_OTP_MOCK: bool = True
    DEFAULT_OTP_CODE: str = "123456"
    CORS_ORIGINS: List[str] = ["*"]

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
