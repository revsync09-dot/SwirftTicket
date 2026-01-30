from supabase import create_client, ClientOptions

from .config import Config


def build_supabase(config: Config):
    options = ClientOptions(schema=config.supabase_schema)
    return create_client(config.supabase_url, config.supabase_service_key, options=options)
