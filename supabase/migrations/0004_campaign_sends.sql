-- Tracks campaign emails sent through a user's connected Gmail, so "Sent" survives reloads
-- and a lead is never emailed twice for the same campaign. Written only by the service role.
-- Safe to re-run.

create table if not exists campaign_sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  campaign_id text not null,
  contact_id text not null,
  to_email text not null,
  from_email text not null,
  subject text not null,
  message_id text,
  sent_at timestamptz not null default now(),
  unique (user_id, campaign_id, contact_id)
);

create index if not exists campaign_sends_user_idx on campaign_sends (user_id, sent_at desc);

alter table campaign_sends enable row level security;

drop policy if exists campaign_sends_owner_select on campaign_sends;
create policy campaign_sends_owner_select on campaign_sends
  for select using (auth.uid() = user_id);
drop policy if exists campaign_sends_service_role_all on campaign_sends;
create policy campaign_sends_service_role_all on campaign_sends
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

notify pgrst, 'reload schema';
