-- Copilot wake-ups: server-side events that resume a conversation's agent
-- (a prospecting run finished, a plan was approved, a message arrived while
-- a background turn was running). One live turn per conversation, enforced by
-- a short lease so a crashed job is picked up by the sweeper.

create table copilot_wakeups (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references copilot_conversations (id) on delete cascade,
  user_id uuid not null,
  kind text not null check (kind in ('run_completed', 'plan_approved', 'plan_continue', 'user_message')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index copilot_wakeups_conversation_idx on copilot_wakeups (conversation_id, created_at);
create index copilot_wakeups_pending_idx on copilot_wakeups (created_at) where status in ('pending', 'running');

alter table copilot_conversations add column if not exists turn_lease_owner text;
alter table copilot_conversations add column if not exists turn_lease_expires_at timestamptz;

-- A run started from chat knows which conversation to wake. acknowledged_at is
-- set when the agent already consumed the result in-turn (await_run), so the
-- completion hook does not trigger a duplicate analysis turn.
alter table prospecting_runs add column if not exists conversation_id uuid references copilot_conversations (id) on delete set null;
alter table prospecting_runs add column if not exists acknowledged_at timestamptz;

-- Atomic claim of the conversation's single turn slot.
create or replace function claim_copilot_turn(p_conversation uuid, p_owner text, p_lease_seconds integer)
returns boolean
language plpgsql
as $$
declare
  claimed integer;
begin
  update copilot_conversations
     set turn_lease_owner = p_owner,
         turn_lease_expires_at = now() + make_interval(secs => p_lease_seconds)
   where id = p_conversation
     and (turn_lease_expires_at is null or turn_lease_expires_at < now() or turn_lease_owner = p_owner);
  get diagnostics claimed = row_count;
  return claimed > 0;
end;
$$;

alter table copilot_wakeups enable row level security;
create policy copilot_wakeups_service_role_all on copilot_wakeups
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
