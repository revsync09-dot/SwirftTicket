import { supabase } from '../supabase.js';
const table = 'ticket_links';
export async function listLinks(ticketId) {
    const { data, error } = await supabase.from(table).select().eq('ticket_id', ticketId).order('id', { ascending: true });
    if (error)
        throw new Error(error.message);
    return data ?? [];
}
export async function createLink(guildId, ticketId, linkedId, createdBy) {
    const { data, error } = await supabase
        .from(table)
        .insert({ guild_id: guildId, ticket_id: ticketId, linked_ticket_id: linkedId, created_by: createdBy })
        .select()
        .single();
    if (error || !data)
        throw new Error(error?.message ?? 'Failed to create link');
    return data;
}
