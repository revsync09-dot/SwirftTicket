import 'dotenv/config';
function getEnv(key) {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing required env var ${key}`);
    }
    return value;
}
export const config = {
    discordToken: getEnv('DISCORD_TOKEN'),
    appId: getEnv('DISCORD_APP_ID'),
    guildId: getEnv('GUILD_ID'),
    ticketParentChannelId: getEnv('TICKET_PARENT_CHANNEL_ID'),
    staffRoleId: getEnv('STAFF_ROLE_ID'),
    supabaseUrl: getEnv('SUPABASE_URL'),
    supabaseKey: getEnv('SUPABASE_SERVICE_ROLE_KEY'),
    supabaseSchema: process.env.SUPABASE_DB_SCHEMA ?? 'public',
    timezone: process.env.TIMEZONE ?? 'UTC',
};
