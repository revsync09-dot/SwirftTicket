import { supabase } from './supabase.js';

export interface GuildSettings {
  guild_id: string;
  ticket_parent_channel_id: string;
  staff_role_id: string;
  timezone: string | null;
  category_slots: number | null;
  warn_threshold?: number | null;
  warn_timeout_minutes?: number | null;
  enable_smart_replies?: boolean | null;
  enable_ai_suggestions?: boolean | null;
  enable_auto_priority?: boolean | null;
}

const table = 'guild_settings';

export async function getGuildSettings(guildId: string): Promise<GuildSettings | null> {
  const { data, error } = await supabase.from(table).select().eq('guild_id', guildId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function upsertGuildSettings(input: GuildSettings): Promise<GuildSettings> {
  const { data, error } = await supabase.from(table).upsert(input).select().single();
  if (error || !data) throw new Error(error?.message);
  return data;
}
