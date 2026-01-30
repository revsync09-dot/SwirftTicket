import { supabase } from '../supabase.js';

export interface TicketLink {
  id: number;
  guild_id: string;
  ticket_id: number;
  linked_ticket_id: number;
  created_by: string;
  created_at: string;
}

const table = 'ticket_links';

export async function listLinks(ticketId: number): Promise<TicketLink[]> {
  const { data, error } = await supabase.from(table).select().eq('ticket_id', ticketId).order('id', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as TicketLink[]) ?? [];
}

export async function createLink(guildId: string, ticketId: number, linkedId: number, createdBy: string) {
  const { data, error } = await supabase
    .from(table)
    .insert({ guild_id: guildId, ticket_id: ticketId, linked_ticket_id: linkedId, created_by: createdBy })
    .select()
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Failed to create link');
  return data as TicketLink;
}
