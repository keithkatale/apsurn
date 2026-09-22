-- Saved outreach drafts (generated or edited) before send.

create table if not exists outreach_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  contact_id uuid not null references contacts (id) on delete cascade,
  sequence_id uuid not null references sequences (id) on delete cascade,
  subject text not null default '',
  body text not null default '',
  source text not null default 'ai',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, contact_id, sequence_id)
);

create index if not exists outreach_drafts_user_sequence_idx
  on outreach_drafts (user_id, sequence_id);

alter table outreach_drafts enable row level security;

create policy outreach_drafts_owner_all on outreach_drafts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy outreach_drafts_service_role_all on outreach_drafts
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
