from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=True)

    PROJECT_NAME: str = "SIRA Backend API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = "sira_super_secret_jwt_key_abidjan_2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 jours
    DATABASE_URL: str = "postgresql://postgres:47309688Ak%40@db.kmfukfzsdvkjskztrhzb.supabase.co:5432/postgres"

    # Supabase credentials
    SUPABASE_URL: Optional[str] = "https://kmfukfzsdvkjskztrhzb.supabase.co"
    SUPABASE_KEY: Optional[str] = "sb_publishable_I7GyLw2P3TXKhV02-byztg_hgBuhKn_"
    SUPABASE_PROJECT_REF: Optional[str] = "kmfukfzsdvkjskztrhzb"

    # Configuration SMS (Orange Côte d'Ivoire & Twilio)
    ORANGE_OTP_MOCK: bool = False
    DEFAULT_OTP_CODE: str = "123456"
    
    # Orange Developer API CI
    ORANGE_AUTH_HEADER: Optional[str] = "Basic MjB2RlBwbFVxaXlCb2xzbWYwekl2MThGeXpjd3RuRXg6VkRMQ0E0aG5JYjNFWmxtY2VCbmlyclZzSE9nNFdwT0Q0bUM1RWtkVFRyckk="
    ORANGE_CLIENT_ID: Optional[str] = "20vFPplUqiyBolsmf0zIv18FyzcwtnEx"
    ORANGE_CLIENT_SECRET: Optional[str] = "VDLCA4hnIb3EZlmceBnirrVsHOg4WpOD4mC5EkdTTrrI"
    ORANGE_SENDER_ADDRESS: Optional[str] = "tel:+2250000"
    
    # Twilio SMS Gateway (Alternative internationale)
    TWILIO_ACCOUNT_SID: Optional[str] = None
    TWILIO_AUTH_TOKEN: Optional[str] = None
    TWILIO_FROM_NUMBER: Optional[str] = None

    CORS_ORIGINS: List[str] = ["*"]

settings = Settings()
