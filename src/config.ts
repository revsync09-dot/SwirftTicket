import 'dotenv/config';

type RequiredKey = 'DISCORD_TOKEN' | 'DISCORD_APP_ID' | 'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY';

function getEnv(key: RequiredKey): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var ${key}`);
  }
  return value;
}

export const config = {
  discordToken: getEnv('DISCORD_TOKEN'),
  appId: getEnv('DISCORD_APP_ID'),
  supabaseUrl: getEnv('SUPABASE_URL'),
  supabaseKey: getEnv('SUPABASE_SERVICE_ROLE_KEY'),
  supabaseSchema: process.env.SUPABASE_DB_SCHEMA ?? 'public',
  timezone: process.env.TIMEZONE ?? 'UTC',
};
