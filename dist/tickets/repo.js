import { supabase } from '../supabase.js';
const table = 'tickets';
export async function createTicket(params) {
    const now = new Date().toISOString();
    const { data, error } = await supabase
        .from(table)
        .insert({
        guild_id: params.guildId,
        channel_id: params.channelId,
        creator_id: params.creatorId,
        query_text: params.queryText,
        status: 'OPEN',
        created_at: now,
    })
        .select()
        .single();
    if (error || !data) {
        throw new Error(`Failed to create ticket: ${error?.message}`);
    }
    return data;
}
export async function setTicketMessageId(id, messageId) {
    const { error } = await supabase.from(table).update({ message_id: messageId }).eq('id', id);
    if (error)
        throw new Error(`Failed to set message id: ${error.message}`);
}
export async function getTicketByChannel(channelId) {
    const { data, error } = await supabase.from(table).select().eq('channel_id', channelId).maybeSingle();
    if (error)
        throw new Error(error.message);
    return data;
}
export async function getTicketByMessage(messageId) {
    const { data, error } = await supabase.from(table).select().eq('message_id', messageId).maybeSingle();
    if (error)
        throw new Error(error.message);
    return data;
}
export async function claimTicket(id, userId) {
    const now = new Date().toISOString();
    const { data, error } = await supabase
        .from(table)
        .update({ status: 'CLAIMED', claimed_by: userId, claimed_at: now })
        .eq('id', id)
        .select()
        .single();
    if (error || !data)
        throw new Error(`Failed to claim ticket: ${error?.message}`);
    return data;
}
export async function closeTicket(id, userId) {
    const now = new Date().toISOString();
    const { data, error } = await supabase
        .from(table)
        .update({ status: 'CLOSED', closed_by: userId, closed_at: now })
        .eq('id', id)
        .select()
        .single();
    if (error || !data)
        throw new Error(`Failed to close ticket: ${error?.message}`);
    return data;
}
export async function listUserTicketStats(userId) {
    const base = supabase.from(table);
    const [created, claimed, closed] = await Promise.all([
        base.select('id', { count: 'exact', head: true }).eq('creator_id', userId),
        base.select('id', { count: 'exact', head: true }).eq('claimed_by', userId),
        base.select('id', { count: 'exact', head: true }).eq('closed_by', userId),
    ]);
    if (created.error)
        throw new Error(created.error.message);
    if (claimed.error)
        throw new Error(claimed.error.message);
    if (closed.error)
        throw new Error(closed.error.message);
    return {
        created: created.count ?? 0,
        claimed: claimed.count ?? 0,
        closed: closed.count ?? 0,
    };
}
export async function ticketCountsRolling(days) {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const { data, error } = await supabase
        .from(table)
        .select('created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: true });
    if (error)
        throw new Error(error.message);
    return data ?? [];
}
export async function ticketCountsRollingByCreator(userId, days) {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const { data, error } = await supabase
        .from(table)
        .select('created_at')
        .eq('creator_id', userId)
        .gte('created_at', since)
        .order('created_at', { ascending: true });
    if (error)
        throw new Error(error.message);
    return data ?? [];
}
