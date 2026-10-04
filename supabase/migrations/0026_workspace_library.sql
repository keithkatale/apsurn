-- Workspace library: documents the Copilot writes and the user keeps (brand identity, brand vision,
-- email templates, playbooks, client demo pages). Also lets Copilot artifacts be generated UI and documents.

alter table copilot_artifacts drop constraint if exists copilot_artifacts_kind_check;
alter table copilot_artifacts
  add constraint copilot_artifacts_kind_check
  check (kind in ('sequence', 'lead_table', 'run', 'ui', 'document'));

create table if not exists workspace_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null default 'note'
    check (kind in ('brand_identity', 'brand_vision', 'email_template', 'playbook', 'battlecard', 'demo_page', 'page', 'note')),
  title text not null,
  body text not null default '',
  blocks jsonb,
  share_slug text unique,
  is_public boolean not null default false,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workspace_documents_user_idx
  on workspace_documents (user_id, updated_at desc);

create table if not exists workspace_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references workspace_documents (id) on delete cascade,
  version integer not null,
  title text not null,
  body text not null default '',
  blocks jsonb,
  created_at timestamptz not null default now()
);

create index if not exists workspace_document_versions_doc_idx
  on workspace_document_versions (document_id, version desc);

alter table workspace_documents enable row level security;
alter table workspace_document_versions enable row level security;

create policy workspace_documents_owner_all on workspace_documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy workspace_documents_service_role_all on workspace_documents
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy workspace_document_versions_service_role_all on workspace_document_versions
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
