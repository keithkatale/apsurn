-- Interactive Copilot artifacts: campaigns, lead tables, and prospecting runs
-- rendered in chat. payload is server truth; state tracks user mutations.

create table if not exists copilot_artifacts (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references copilot_conversations (id) on delete cascade,
  user_id uuid not null,
  kind text not null check (kind in ('sequence', 'lead_table', 'run')),
  title text,
  payload jsonb not null default '{}'::jsonb,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists copilot_artifacts_conversation_idx
  on copilot_artifacts (conversation_id, created_at asc);

alter table copilot_artifacts enable row level security;

create policy copilot_artifacts_owner_all on copilot_artifacts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy copilot_artifacts_service_role_all on copilot_artifacts
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
