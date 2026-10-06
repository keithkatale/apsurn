-- Every buying signal the signal scout reports for a user. The unique key is
-- what makes recurring scans safe: the same funding round or job posting is
-- never reported twice, even though "found 9 days ago" keeps changing.

create table prospect_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  domain text not null,
  trigger_type text not null check (trigger_type in ('hiring', 'funding_news', 'social_pain', 'tech_website')),
  event_key text not null,
  headline text not null,
  source_url text,
  excerpt text,
  event_date timestamptz,
  score numeric,
  run_id uuid references prospecting_runs (id) on delete set null,
  prospect_company_id uuid references prospect_companies (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, trigger_type, event_key)
);

create index prospect_signals_user_domain_idx on prospect_signals (user_id, domain);
create index prospect_signals_company_idx on prospect_signals (prospect_company_id);

alter table prospect_signals enable row level security;

create policy prospect_signals_owner_select on prospect_signals
  for select using (auth.uid() = user_id);
create policy prospect_signals_service_role_all on prospect_signals
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
