-- Copilot chat: conversations + messages. metadata jsonb carries all rich-UI
-- replay state (tool args, activity) so no extra tables are needed.

create table copilot_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index copilot_conversations_user_updated_idx on copilot_conversations (user_id, updated_at desc);

create table copilot_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references copilot_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'model', 'tool')),
  content text not null default '',
  tool_name text,
  tool_call_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index copilot_messages_conversation_created_idx on copilot_messages (conversation_id, created_at asc);

alter table copilot_conversations enable row level security;
alter table copilot_messages enable row level security;

create policy copilot_conversations_owner_all on copilot_conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy copilot_conversations_service_role_all on copilot_conversations
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy copilot_messages_owner_all on copilot_messages
  for all using (exists (select 1 from copilot_conversations c where c.id = conversation_id and c.user_id = auth.uid()))
  with check (exists (select 1 from copilot_conversations c where c.id = conversation_id and c.user_id = auth.uid()));
create policy copilot_messages_service_role_all on copilot_messages
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
