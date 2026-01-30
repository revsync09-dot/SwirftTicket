import { supabase } from '../supabase.js';
const table = 'mod_actions';
export async function getModHistorySummary(guildId, userId) {
    const [warn, mute, ban] = await Promise.all([
        supabase.from(table).select('id', { count: 'exact', head: true }).eq('guild_id', guildId).eq('user_id', userId).eq('action_type', 'WARN'),
        supabase.from(table).select('id', { count: 'exact', head: true }).eq('guild_id', guildId).eq('user_id', userId).eq('action_type', 'MUTE'),
        supabase.from(table).select('id', { count: 'exact', head: true }).eq('guild_id', guildId).eq('user_id', userId).eq('action_type', 'BAN'),
    ]);
    if (warn.error)
        throw new Error(warn.error.message);
    if (mute.error)
        throw new Error(mute.error.message);
    if (ban.error)
        throw new Error(ban.error.message);
    return {
        warnings: warn.count ?? 0,
        mutes: mute.count ?? 0,
        bans: ban.count ?? 0,
    };
}
export async function createModAction(params) {
    const { data, error } = await supabase
        .from(table)
        .insert({
        guild_id: params.guildId,
        user_id: params.userId,
        action_type: params.actionType,
        reason: params.reason ?? null,
        created_by: params.createdBy ?? null,
    })
        .select()
        .single();
    if (error || !data)
        throw new Error(error?.message ?? 'Failed to log mod action');
    return data;
}
