-- Durable agent tasks: an approved plan run inside a Copilot conversation,
-- executed in resumable slices by /api/jobs/agent-task so it can outlive any
-- single HTTP request and survive the user closing the tab.

create table agent_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  conversation_id uuid references copilot_conversations (id) on delete cascade,
  schedule_id uuid,
  status text not null default 'awaiting_approval'
    check (status in ('awaiting_approval', 'queued', 'running', 'waiting', 'paused', 'completed', 'failed', 'cancelling', 'cancelled')),
  goal text not null,
  plan jsonb not null default '{}'::jsonb,
  budget_credits integer not null default 0 check (budget_credits >= 0),
  spent_credits integer not null default 0 check (spent_credits >= 0),
  lease_owner text,
  lease_expires_at timestamptz,
  slice_count integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

create index agent_tasks_user_created_idx on agent_tasks (user_id, created_at desc);
create index agent_tasks_conversation_idx on agent_tasks (conversation_id);
-- The sweeper's hot path: live tasks whose lease may have lapsed.
create index agent_tasks_live_idx on agent_tasks (lease_expires_at)
  where status in ('queued', 'running', 'waiting');

create table agent_task_steps (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references agent_tasks (id) on delete cascade,
  idx integer not null,
  title text not null,
  agent text,
  instruction text not null default '',
  tool text,
  args jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'done', 'failed', 'skipped', 'awaiting_confirmation')),
  attempts integer not null default 0,
  est_credits integer not null default 0,
  result_summary text,
  output jsonb not null default '{}'::jsonb,
  run_id uuid,
  started_at timestamptz,
  finished_at timestamptz,
  unique (task_id, idx)
);

-- Append-only progress log. The client tails it with ?after=<id>, so
-- reopening a tab replays a background task's progress without realtime.
create table agent_task_events (
  id bigserial primary key,
  task_id uuid not null references agent_tasks (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index agent_task_events_task_idx on agent_task_events (task_id, id);

alter table prospecting_runs add column if not exists agent_task_id uuid references agent_tasks (id) on delete set null;

alter table copilot_artifacts drop constraint if exists copilot_artifacts_kind_check;
alter table copilot_artifacts
  add constraint copilot_artifacts_kind_check
  check (kind in ('sequence', 'lead_table', 'run', 'ui', 'document', 'plan'));

-- One atomic claim so two workers can never run the same task at once.
-- Supabase-js can't express "update where lease expired, returning row" as
-- a single statement, which is what makes the claim race-free.
create or replace function claim_agent_task(p_task uuid, p_owner text, p_lease_seconds integer)
returns setof agent_tasks
language sql
as $$
  update agent_tasks
     set status = case when status = 'queued' then 'running' else status end,
         lease_owner = p_owner,
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         slice_count = slice_count + 1,
         started_at = coalesce(started_at, now()),
         updated_at = now()
   where id = p_task
     and status in ('queued', 'running', 'waiting')
     and (lease_expires_at is null or lease_expires_at < now() or lease_owner = p_owner)
  returning *;
$$;

alter table agent_tasks enable row level security;
alter table agent_task_steps enable row level security;
alter table agent_task_events enable row level security;

create policy agent_tasks_owner_select on agent_tasks
  for select using (auth.uid() = user_id);
create policy agent_tasks_service_role_all on agent_tasks
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy agent_task_steps_owner_select on agent_task_steps
  for select using (exists (select 1 from agent_tasks t where t.id = task_id and t.user_id = auth.uid()));
create policy agent_task_steps_service_role_all on agent_task_steps
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy agent_task_events_owner_select on agent_task_events
  for select using (exists (select 1 from agent_tasks t where t.id = task_id and t.user_id = auth.uid()));
create policy agent_task_events_service_role_all on agent_task_events
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
