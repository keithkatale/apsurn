-- Prospect companies + contacts found by the pluggable prospecting
-- data-source layer (web_scrape for MVP; paid enrichment sources later).

create table prospect_companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null, -- FK to auth.users reinstated once auth is added
  company_id uuid not null references companies (id) on delete cascade,
  name text not null,
  domain text not null,
  website_url text,
  industry text,
  employee_range text,
  location text,
  source text not null default 'web_scrape',
  source_ref jsonb not null default '{}',
  icp_fit_score numeric,
  status text not null default 'new'
    check (status in ('new', 'qualified', 'rejected', 'contacted')),
  created_at timestamptz not null default now(),
  unique (company_id, domain)
);

create index prospect_companies_company_id_idx on prospect_companies (company_id);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  prospect_company_id uuid not null references prospect_companies (id) on delete cascade,
  full_name text,
  title text,
  email text,
  email_status text not null default 'unverified'
    check (email_status in ('unverified', 'guessed', 'verified', 'invalid')),
  linkedin_url text,
  source text not null default 'web_scrape',
  source_ref jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (prospect_company_id, email)
);

create index contacts_prospect_company_id_idx on contacts (prospect_company_id);

alter table prospect_companies enable row level security;
alter table contacts enable row level security;

create policy prospect_companies_owner_all on prospect_companies
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy prospect_companies_service_role_all on prospect_companies
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy contacts_owner_all on contacts
  for all using (
    auth.uid() = (
      select user_id from prospect_companies
      where prospect_companies.id = contacts.prospect_company_id
    )
  ) with check (
    auth.uid() = (
      select user_id from prospect_companies
      where prospect_companies.id = contacts.prospect_company_id
    )
  );
create policy contacts_service_role_all on contacts
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
