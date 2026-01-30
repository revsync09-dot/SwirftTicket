import { supabase } from './supabase.js';
const table = 'guild_settings';
export async function getGuildSettings(guildId) {
    const { data, error } = await supabase.from(table).select().eq('guild_id', guildId).maybeSingle();
    if (error)
        throw new Error(error.message);
    return data;
}
export async function upsertGuildSettings(input) {
    const { data, error } = await supabase.from(table).upsert(input).select().single();
    if (error || !data)
        throw new Error(error?.message);
    return data;
}
