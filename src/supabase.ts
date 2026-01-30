import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './config.js';

export type TicketStatus = 'OPEN' | 'CLAIMED' | 'CLOSED';

export interface TicketRecord {
  id: number;
  guild_id: string;
  channel_id: string;
  message_id: string | null;
  creator_id: string;
  claimed_by: string | null;
  closed_by: string | null;
  status: TicketStatus;
  priority?: 'LOW' | 'NORMAL' | 'HIGH';
  suspicion_reason?: string | null;
  category_id?: number | null;
  category_name?: string | null;
  category_description?: string | null;
  created_at: string;
  claimed_at: string | null;
  closed_at: string | null;
  reopened_at?: string | null;
  reopened_by?: string | null;
  reopen_count?: number | null;
  first_staff_response_at?: string | null;
  first_response_ms?: number | null;
  last_user_message_at?: string | null;
  last_staff_message_at?: string | null;
  avg_response_ms?: number | null;
  response_count?: number | null;
  query_text: string;
}

export const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
  db: { schema: config.supabaseSchema },
}) as SupabaseClient<any, any, any, any, any>;
