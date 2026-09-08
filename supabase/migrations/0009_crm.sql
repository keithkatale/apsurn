-- Lead status lifecycle per contact, and soft-delete for contacts + prospect companies.

alter table contacts add column lead_status text not null default 'new'
  check (lead_status in ('new', 'qualified', 'contacted', 'replied', 'won', 'lost'));

alter table contacts add column archived_at timestamptz;
alter table prospect_companies add column archived_at timestamptz;

-- Default-view filtering hot paths: "give me the non-archived rows" for a list/company.
create index contacts_active_idx on contacts (prospect_company_id) where archived_at is null;
create index prospect_companies_active_idx on prospect_companies (list_id) where archived_at is null;

-- Bulk status/board filtering (e.g. "show me all qualified leads").
create index contacts_lead_status_idx on contacts (lead_status) where archived_at is null;
