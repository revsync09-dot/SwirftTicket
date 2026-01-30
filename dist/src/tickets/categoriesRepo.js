import { supabase } from '../supabase.js';
const table = 'ticket_categories';
export async function listTicketCategories(guildId) {
    const { data, error } = await supabase.from(table).select().eq('guild_id', guildId).order('id', { ascending: true });
    if (error)
        throw new Error(error.message);
    return data ?? [];
}
export async function createTicketCategory(guildId, name, description) {
    const { data, error } = await supabase
        .from(table)
        .insert({ guild_id: guildId, name, description: description ?? null })
        .select()
        .single();
    if (error || !data)
        throw new Error(error?.message ?? 'Failed to create category');
    return data;
}
