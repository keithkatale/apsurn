-- Founder's own company + the AI-generated blueprint (ICP, personas, etc.)
-- derived from scraping their website.

create extension if not exists pgcrypto;

create table companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null, -- FK to auth.users reinstated once auth is added
  website_url text not null,
  name text,
  status text not null default 'scraping'
    check (status in ('scraping', 'analyzing', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One company per user for MVP (revisit for agencies/multi-brand later).
create unique index companies_user_id_idx on companies (user_id);

create table company_blueprints (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  raw_scrape jsonb not null default '{}',
  icp jsonb not null default '{}',
  personas jsonb not null default '[]',
  value_prop text,
  positioning text,
  product_summary text,
  competitors jsonb not null default '[]',
  confidence text not null default 'model'
    check (confidence in ('model', 'heuristic_fallback')),
  model_used text,
  edited_by_user boolean not null default false,
  approved_at timestamptz,
  generated_at timestamptz not null default now()
);

create unique index company_blueprints_company_id_idx on company_blueprints (company_id);

alter table companies enable row level security;
alter table company_blueprints enable row level security;

create policy companies_owner_all on companies
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy companies_service_role_all on companies
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy company_blueprints_owner_all on company_blueprints
  for all using (
    auth.uid() = (select user_id from companies where companies.id = company_blueprints.company_id)
  ) with check (
    auth.uid() = (select user_id from companies where companies.id = company_blueprints.company_id)
  );
create policy company_blueprints_service_role_all on company_blueprints
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
