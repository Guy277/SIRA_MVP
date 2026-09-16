from supabase import create_client, Client
from app.config import settings

def get_supabase_client() -> Client:
    if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
        raise ValueError("SUPABASE_URL ou SUPABASE_KEY manquant dans la configuration.")
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
