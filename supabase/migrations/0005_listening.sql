-- Internet listening: watches (what to track), scan_runs (each scan and its cost) and signals
-- (scored buying-intent posts). Written only by the service role; owners can read their own rows.
-- Safe to re-run. Does NOT touch any existing table.

create table if not exists listening_watches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  company_id uuid,
  kind text not null default 'keyword',          -- keyword | competitor | company | job_title
  query text not null,
  sources text[] not null default '{hackernews,bluesky,stackexchange,lemmy,github}',
  frequency text not null default 'daily',       -- manual | daily | twice_daily
  active boolean not null default true,
  last_scanned_at timestamptz,
  cursor jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, kind, query)
);
create index if not exists listening_watches_user_idx on listening_watches (user_id, active);

create table if not exists scan_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source text not null,
  status text not null default 'running',        -- running | done | failed
  apify_run_id text,
  items_found int not null default 0,
  items_kept int not null default 0,
  credits_charged int not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists scan_runs_user_idx on scan_runs (user_id, started_at desc);
create unique index if not exists scan_runs_apify_uidx on scan_runs (apify_run_id) where apify_run_id is not null;

create table if not exists signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  company_id uuid,
  source text not null,
  external_id text not null,
  url text not null,
  author text,
  author_headline text,
  company_name text,
  domain text,
  community text,
  title text,
  text text not null,
  posted_at timestamptz,
  matched_query text,
  signal_type text not null default 'other',     -- buying | recommendation | comparison | pain | competitor_churn | hiring | funding | new_company | other
  score int not null default 0,
  icp_fit int not null default 0,
  reason text,
  outreach_angle text,
  status text not null default 'new',            -- new | saved | dismissed | lead
  prospect_company_id uuid,
  scan_run_id uuid,
  created_at timestamptz not null default now(),
  unique (user_id, source, external_id)
);
create index if not exists signals_feed_idx on signals (user_id, status, score desc, posted_at desc);

alter table listening_watches enable row level security;
alter table scan_runs enable row level security;
alter table signals enable row level security;

drop policy if exists listening_watches_owner_select on listening_watches;
create policy listening_watches_owner_select on listening_watches for select using (auth.uid() = user_id);
drop policy if exists listening_watches_service_role_all on listening_watches;
create policy listening_watches_service_role_all on listening_watches
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists scan_runs_owner_select on scan_runs;
create policy scan_runs_owner_select on scan_runs for select using (auth.uid() = user_id);
drop policy if exists scan_runs_service_role_all on scan_runs;
create policy scan_runs_service_role_all on scan_runs
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists signals_owner_select on signals;
create policy signals_owner_select on signals for select using (auth.uid() = user_id);
drop policy if exists signals_service_role_all on signals;
create policy signals_service_role_all on signals
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

notify pgrst, 'reload schema';
