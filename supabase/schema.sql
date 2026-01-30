create table if not exists public.tickets (
  id bigserial primary key,
  guild_id text not null,
  channel_id text not null,
  message_id text,
  creator_id text not null,
  claimed_by text,
  closed_by text,
  status text not null check (status in ('OPEN','CLAIMED','CLOSED')),
  priority text not null default 'NORMAL' check (priority in ('LOW','NORMAL','HIGH')),
  suspicion_reason text,
  category_id bigint,
  category_name text,
  category_description text,
  created_at timestamptz not null default timezone('utc', now()),
  claimed_at timestamptz,
  closed_at timestamptz,
  reopened_at timestamptz,
  reopened_by text,
  reopen_count integer default 0,
  first_staff_response_at timestamptz,
  first_response_ms integer,
  last_user_message_at timestamptz,
  last_staff_message_at timestamptz,
  avg_response_ms integer,
  response_count integer default 0,
  query_text text not null
);

create index if not exists tickets_guild_idx on public.tickets (guild_id);
create index if not exists tickets_creator_idx on public.tickets (creator_id);
create index if not exists tickets_claimed_idx on public.tickets (claimed_by);
create index if not exists tickets_closed_idx on public.tickets (closed_by);
create index if not exists tickets_created_at_idx on public.tickets (created_at desc);

create table if not exists public.ticket_links (
  id bigserial primary key,
  guild_id text not null,
  ticket_id bigint not null references public.tickets(id) on delete cascade,
  linked_ticket_id bigint not null references public.tickets(id) on delete cascade,
  created_by text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists ticket_links_ticket_idx on public.ticket_links (ticket_id);

create table if not exists public.mod_actions (
  id bigserial primary key,
  guild_id text not null,
  user_id text not null,
  action_type text not null check (action_type in ('WARN','MUTE','BAN')),
  reason text,
  created_by text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists mod_actions_user_idx on public.mod_actions (guild_id, user_id);

create table if not exists public.guild_settings (
  guild_id text primary key,
  ticket_parent_channel_id text not null,
  staff_role_id text not null,
  timezone text default 'UTC',
  category_slots integer default 1,
  warn_threshold integer default 3,
  warn_timeout_minutes integer default 10,
  enable_smart_replies boolean default true,
  enable_ai_suggestions boolean default true,
  enable_auto_priority boolean default true
);

create table if not exists public.ticket_categories (
  id bigserial primary key,
  guild_id text not null,
  name text not null,
  description text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists ticket_categories_guild_idx on public.ticket_categories (guild_id);
