-- Unified signal radar: one watch per company, one durable signal table fed by
-- many free sources, and per-source health so rate limits back off safely.

create table radar_watches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  company_id uuid not null references companies (id) on delete cascade,
  sources text[] not null default '{}',
  keywords text[] not null default '{}',
  competitors text[] not null default '{}',
  geographies text[] not null default '{}',
  forums text[] not null default '{}',
  ats_boards jsonb not null default '[]'::jsonb,
  min_score int not null default 70 check (min_score between 0 and 100),
  auto_source boolean not null default false,
  daily_auto_cap int not null default 5 check (daily_auto_cap between 0 and 50),
  cadence_minutes int not null default 360 check (cadence_minutes >= 30),
  is_active boolean not null default true,
  next_run_at timestamptz not null default now(),
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id)
);

create index radar_watches_due_idx on radar_watches (next_run_at) where is_active;

create table radar_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  company_id uuid not null references companies (id) on delete cascade,
  watch_id uuid references radar_watches (id) on delete set null,
  source text not null,
  signal_type text not null,
  entity_name text,
  domain text,
  url text not null,
  title text not null,
  excerpt text,
  author text,
  event_at timestamptz,
  score int not null check (score between 0 and 100),
  reason text,
  opener text,
  status text not null default 'new' check (status in ('new', 'saved', 'dismissed', 'auto_sourced')),
  prospect_company_id uuid references prospect_companies (id) on delete set null,
  dedupe_key text not null,
  meta jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create index radar_signals_feed_idx on radar_signals (company_id, score desc) where status = 'new';
create index radar_signals_domain_idx on radar_signals (user_id, domain);

create table radar_source_state (
  source text primary key,
  backoff_until timestamptz,
  consecutive_failures int not null default 0,
  last_ok_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

alter table radar_watches enable row level security;
alter table radar_signals enable row level security;
alter table radar_source_state enable row level security;

create policy radar_watches_owner_select on radar_watches
  for select using (auth.uid() = user_id);
create policy radar_watches_service_role_all on radar_watches
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy radar_signals_owner_select on radar_signals
  for select using (auth.uid() = user_id);
create policy radar_signals_service_role_all on radar_signals
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy radar_source_state_service_role_all on radar_source_state
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
