-- Named, savable prospect lists — each search run (a set of criteria) produces
-- one list, so a user can build multiple lists around different criteria and
-- come back to plan outreach against them later.

create table prospect_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null, -- FK to auth.users reinstated once auth is added
  company_id uuid not null references companies (id) on delete cascade,
  name text not null,
  criteria jsonb not null default '{}', -- { industries, companySizeRange, geographies }
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
  requested_count int not null default 0,
  found_count int not null default 0,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index prospect_lists_company_id_idx on prospect_lists (company_id);

alter table prospect_companies add column list_id uuid references prospect_lists (id) on delete cascade;
create index prospect_companies_list_id_idx on prospect_companies (list_id);

-- The same domain can legitimately turn up in more than one list (different
-- searches can overlap) — dedupe within a list instead of across all of a
-- company's prospecting history.
alter table prospect_companies drop constraint prospect_companies_company_id_domain_key;
create unique index prospect_companies_list_id_domain_idx on prospect_companies (list_id, domain);

alter table prospect_lists enable row level security;

create policy prospect_lists_owner_all on prospect_lists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy prospect_lists_service_role_all on prospect_lists
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
