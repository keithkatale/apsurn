-- In-app support chat: AI answers, human handoff, and admin replies.
-- All access goes through the service role (API routes); there are no end-user policies.

create table if not exists support_conversations (
  id uuid primary key default gen_random_uuid(),
  visitor_id text not null,
  user_id uuid,
  email text,
  status text not null default 'open'
    check (status in ('open', 'needs_human', 'answered', 'closed')),
  human_joined boolean not null default false,
  needs_email boolean not null default false,
  last_message_at timestamptz not null default now(),
  emailed_upto timestamptz,
  visitor_last_seen_at timestamptz,
  admin_last_read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists support_conversations_status_idx
  on support_conversations (status, last_message_at desc);
create index if not exists support_conversations_visitor_idx
  on support_conversations (visitor_id);

create table if not exists support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references support_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'admin')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists support_messages_conversation_idx
  on support_messages (conversation_id, created_at asc);

alter table support_conversations enable row level security;
alter table support_messages enable row level security;

create policy support_conversations_service_role_all on support_conversations
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy support_messages_service_role_all on support_messages
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
