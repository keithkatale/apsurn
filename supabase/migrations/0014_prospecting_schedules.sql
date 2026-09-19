-- Per-company weekly prospecting target: "find N new qualified accounts every
-- week." Polled by the runScheduledProspecting cron (src/lib/inngest/functions.ts)
-- via claimDueSchedules (src/lib/prospecting/scheduling.ts).

create table prospecting_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  company_id uuid not null references companies (id) on delete cascade,
  weekly_target int not null check (weekly_target between 1 and 100),
  time_of_day text not null default '08:00' check (time_of_day ~ '^[0-2][0-9]:[0-5][0-9]$'),
  weekday int not null default 1 check (weekday between 0 and 6),
  timezone text not null default 'UTC',
  is_active boolean not null default true,
  next_run_at timestamptz not null,
  last_run_at timestamptz,
  criteria jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index prospecting_schedules_due_idx on prospecting_schedules (next_run_at) where is_active = true;
create index prospecting_schedules_user_idx on prospecting_schedules (user_id);

alter table prospecting_schedules enable row level security;

create policy prospecting_schedules_owner_all on prospecting_schedules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy prospecting_schedules_service_role_all on prospecting_schedules
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
