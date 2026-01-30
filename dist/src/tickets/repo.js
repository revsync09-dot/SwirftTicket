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
        priority: params.priority ?? 'NORMAL',
        suspicion_reason: params.suspicionReason ?? null,
        category_id: params.categoryId ?? null,
        category_name: params.categoryName ?? null,
        category_description: params.categoryDescription ?? null,
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
export async function reopenTicket(id, userId, status, keepClaimer) {
    const now = new Date().toISOString();
    const update = {
        status,
        reopened_by: userId,
        reopened_at: now,
    };
    const { data: current } = await supabase.from(table).select('reopen_count').eq('id', id).single();
    const count = (current?.reopen_count ?? 0) + 1;
    update.reopen_count = count;
    if (!keepClaimer) {
        update.claimed_by = null;
        update.claimed_at = null;
    }
    const { data, error } = await supabase.from(table).update(update).eq('id', id).select().single();
    if (error || !data)
        throw new Error(`Failed to reopen ticket: ${error?.message}`);
    return data;
}
export async function listUserTicketStats(userId, guildId) {
    const [created, claimed, closed] = await Promise.all([
        supabase.from(table).select('id', { count: 'exact', head: true }).eq('guild_id', guildId).eq('creator_id', userId),
        supabase.from(table).select('id', { count: 'exact', head: true }).eq('guild_id', guildId).eq('claimed_by', userId),
        supabase.from(table).select('id', { count: 'exact', head: true }).eq('guild_id', guildId).eq('closed_by', userId),
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
export async function ticketCountsRollingByCreator(userId, guildId, days) {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const { data, error } = await supabase
        .from(table)
        .select('created_at')
        .eq('guild_id', guildId)
        .eq('creator_id', userId)
        .gte('created_at', since)
        .order('created_at', { ascending: true });
    if (error)
        throw new Error(error.message);
    return data ?? [];
}
export async function countRecentTicketsByCreator(guildId, userId, hours) {
    const since = new Date(Date.now() - hours * 3600000).toISOString();
    const { count, error } = await supabase
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('guild_id', guildId)
        .eq('creator_id', userId)
        .gte('created_at', since);
    if (error)
        throw new Error(error.message);
    return count ?? 0;
}
export async function updateTicketMetrics(ticketId, update) {
    const { error } = await supabase.from(table).update(update).eq('id', ticketId);
    if (error)
        throw new Error(error.message);
}
export async function getGuildTicketStats(guildId) {
    const [total, open, claimed, closed] = await Promise.all([
        supabase.from(table).select('id', { count: 'exact', head: true }).eq('guild_id', guildId),
        supabase.from(table).select('id', { count: 'exact', head: true }).eq('guild_id', guildId).eq('status', 'OPEN'),
        supabase.from(table).select('id', { count: 'exact', head: true }).eq('guild_id', guildId).eq('status', 'CLAIMED'),
        supabase.from(table).select('id', { count: 'exact', head: true }).eq('guild_id', guildId).eq('status', 'CLOSED'),
    ]);
    if (total.error)
        throw new Error(total.error.message);
    if (open.error)
        throw new Error(open.error.message);
    if (claimed.error)
        throw new Error(claimed.error.message);
    if (closed.error)
        throw new Error(closed.error.message);
    return {
        total: total.count ?? 0,
        open: open.count ?? 0,
        claimed: claimed.count ?? 0,
        closed: closed.count ?? 0,
    };
}
export async function getUserTicketHistorySummary(guildId, userId) {
    const { data, error } = await supabase
        .from(table)
        .select('created_at, closed_at')
        .eq('guild_id', guildId)
        .eq('creator_id', userId)
        .order('created_at', { ascending: false });
    if (error)
        throw new Error(error.message);
    const rows = data ?? [];
    const last = rows[0]?.closed_at ?? rows[0]?.created_at ?? null;
    return {
        totalTickets: rows.length,
        lastSupportAt: last,
    };
}
