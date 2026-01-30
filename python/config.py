import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass
class Config:
    discord_token: str
    discord_app_id: str
    discord_public_key: str | None
    discord_client_secret: str | None
    supabase_url: str
    supabase_service_key: str
    supabase_schema: str
    timezone: str
    guild_id: str | None
    oauth_redirect_uri: str | None
    session_secret: str | None


def load_config() -> Config:
    return Config(
        discord_token=os.getenv("DISCORD_TOKEN", ""),
        discord_app_id=os.getenv("DISCORD_APP_ID", ""),
        discord_public_key=os.getenv("DISCORD_PUBLIC_KEY"),
        discord_client_secret=os.getenv("DISCORD_CLIENT_SECRET"),
        supabase_url=os.getenv("SUPABASE_URL", ""),
        supabase_service_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""),
        supabase_schema=os.getenv("SUPABASE_DB_SCHEMA", "public"),
        timezone=os.getenv("TIMEZONE", "UTC"),
        guild_id=os.getenv("GUILD_ID"),
        oauth_redirect_uri=os.getenv("OAUTH_REDIRECT_URI"),
        session_secret=os.getenv("SESSION_SECRET"),
    )
