-- The Library is a file system the Copilot organizes: every document lives at a folder path
-- (e.g. "Brand" or "Demos/Acme"), and folders can exist empty. Run after 0026.

alter table workspace_documents
  add column if not exists folder text not null default '';

create index if not exists workspace_documents_folder_idx
  on workspace_documents (user_id, folder);

create table if not exists workspace_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  path text not null,
  created_at timestamptz not null default now(),
  unique (user_id, path)
);

alter table workspace_folders enable row level security;

create policy workspace_folders_owner_all on workspace_folders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy workspace_folders_service_role_all on workspace_folders
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
