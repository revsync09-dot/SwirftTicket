import { supabase } from '../supabase.js';

export interface TicketCategory {
  id: number;
  guild_id: string;
  name: string;
  description?: string | null;
  created_at: string;
}

const table = 'ticket_categories';

export async function listTicketCategories(guildId: string): Promise<TicketCategory[]> {
  const { data, error } = await supabase.from(table).select().eq('guild_id', guildId).order('id', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as TicketCategory[]) ?? [];
}

export async function createTicketCategory(
  guildId: string,
  name: string,
  description?: string | null,
): Promise<TicketCategory> {
  const { data, error } = await supabase
    .from(table)
    .insert({ guild_id: guildId, name, description: description ?? null })
    .select()
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Failed to create category');
  return data as TicketCategory;
}
