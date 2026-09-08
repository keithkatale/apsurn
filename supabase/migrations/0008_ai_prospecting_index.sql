-- Shared, source-backed prospecting index. Canonical tables are service-role
-- only; users see immutable snapshots through their existing prospect lists.

create type contact_kind as enum ('email', 'phone', 'profile');
create type contact_origin as enum ('public', 'inferred', 'customer_confirmed');
create type contact_verification_status as enum
  ('observed', 'verified', 'accept_all', 'risky', 'invalid', 'stale', 'suppressed');

create table indexed_companies (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique,
  name text not null,
  website_url text not null,
  industry text,
  employee_range text,
  location text,
  summary text,
  last_indexed_at timestamptz,
  refresh_after timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table indexed_people (
  id uuid primary key default gen_random_uuid(),
  identity_key text not null unique,
  canonical_name text not null,
  normalized_name text not null,
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index indexed_people_normalized_name_idx on indexed_people (normalized_name);

create table indexed_employments (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references indexed_people (id) on delete cascade,
  company_id uuid not null references indexed_companies (id) on delete cascade,
  title text,
  department text,
  seniority text,
  is_current boolean not null default true,
  confidence numeric not null default 0.5 check (confidence between 0 and 1),
  first_observed_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  unique (person_id, company_id)
);

create index indexed_employments_company_idx on indexed_employments (company_id, is_current);

create table source_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references indexed_companies (id) on delete cascade,
  url text not null unique,
  source_type text not null,
  content_hash text,
  title text,
  robots_allowed boolean not null default true,
  fetched_at timestamptz not null default now(),
  last_error text
);

create table contact_points (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references indexed_people (id) on delete cascade,
  company_id uuid not null references indexed_companies (id) on delete cascade,
  kind contact_kind not null,
  normalized_value text not null,
  display_value text not null,
  origin contact_origin not null,
  status contact_verification_status not null default 'observed',
  confidence numeric not null default 0.5 check (confidence between 0 and 1),
  professional_context boolean not null default true,
  outreach_eligibility text not null default 'not_checked',
  first_observed_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  last_verified_at timestamptz,
  verification_metadata jsonb not null default '{}',
  unique (company_id, kind, normalized_value)
);

create index contact_points_person_idx on contact_points (person_id);
create index contact_points_company_status_idx on contact_points (company_id, status);

create table evidence_observations (
  id uuid primary key default gen_random_uuid(),
  source_document_id uuid not null references source_documents (id) on delete cascade,
  person_id uuid references indexed_people (id) on delete cascade,
  contact_point_id uuid references contact_points (id) on delete cascade,
  field_name text not null,
  excerpt text not null check (length(excerpt) <= 500),
  observed_at timestamptz not null default now(),
  confidence numeric not null default 0.5 check (confidence between 0 and 1)
);

create table prospecting_runs (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null unique references prospect_lists (id) on delete cascade,
  user_id uuid not null,
  status text not null default 'queued'
    check (status in ('queued','discovering','enriching','verifying','completed','partial','failed','cancelled')),
  stage text not null default 'queued',
  processed_count int not null default 0,
  target_count int not null default 0,
  contact_count int not null default 0,
  warning_count int not null default 0,
  error_summary text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index prospecting_runs_user_idx on prospecting_runs (user_id, created_at desc);

create table suppressed_contact_values (
  id uuid primary key default gen_random_uuid(),
  value_hash text not null unique,
  kind contact_kind not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create table privacy_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  request_type text not null check (request_type in ('access','correct','delete','suppress')),
  details text,
  status text not null default 'pending_verification',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table prospect_companies add column canonical_company_id uuid references indexed_companies (id) on delete set null;
alter table prospect_companies add column data_confidence numeric check (data_confidence between 0 and 1);
alter table contacts add column canonical_person_id uuid references indexed_people (id) on delete set null;
alter table contacts add column contact_origin text not null default 'public';
alter table contacts add column confidence numeric check (confidence between 0 and 1);
alter table contacts add column evidence jsonb not null default '[]';
alter table contacts add column observed_at timestamptz;
alter table contacts add constraint contacts_prospect_person_unique unique (prospect_company_id, canonical_person_id);
alter table contacts drop constraint contacts_email_status_check;
alter table contacts add constraint contacts_email_status_check check
  (email_status in ('unverified','guessed','observed','verified','accept_all','risky','invalid','stale','suppressed'));

alter table prospect_lists drop constraint prospect_lists_status_check;
alter table prospect_lists add constraint prospect_lists_status_check check
  (status in ('queued','discovering','enriching','verifying','completed','partial','failed','cancelled'));

alter table indexed_companies enable row level security;
alter table indexed_people enable row level security;
alter table indexed_employments enable row level security;
alter table source_documents enable row level security;
alter table contact_points enable row level security;
alter table evidence_observations enable row level security;
alter table prospecting_runs enable row level security;
alter table suppressed_contact_values enable row level security;
alter table privacy_requests enable row level security;

create policy indexed_companies_service on indexed_companies for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy indexed_people_service on indexed_people for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy indexed_employments_service on indexed_employments for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy source_documents_service on source_documents for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy contact_points_service on contact_points for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy evidence_observations_service on evidence_observations for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy suppressed_contact_values_service on suppressed_contact_values for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy privacy_requests_service on privacy_requests for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy prospecting_runs_owner_select on prospecting_runs for select
  using (auth.uid() = user_id);
create policy prospecting_runs_service on prospecting_runs for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
