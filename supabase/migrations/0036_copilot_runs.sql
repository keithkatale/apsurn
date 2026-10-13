-- A Copilot turn runs on the server independent of the browser. Its progress is an append-only event log the chat
-- tails (and replays after a reload), so the live view survives refreshes, tab closes and long tool calls.

create table copilot_runs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references copilot_conversations (id) on delete cascade,
  user_id uuid not null,
  status text not null default 'running' check (status in ('running', 'done', 'error', 'cancelled')),
  cancel_requested boolean not null default false,
  error text,
  -- Bumped every few seconds while the turn works; a running row that stops beating is a dead run.
  heartbeat_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index copilot_runs_conversation_idx on copilot_runs (conversation_id, started_at desc);

create table copilot_run_events (
  run_id uuid not null references copilot_runs (id) on delete cascade,
  seq integer not null,
  type text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  primary key (run_id, seq)
);

alter table copilot_runs enable row level security;
alter table copilot_run_events enable row level security;

create policy copilot_runs_service_role_all on copilot_runs
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy copilot_run_events_service_role_all on copilot_run_events
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
