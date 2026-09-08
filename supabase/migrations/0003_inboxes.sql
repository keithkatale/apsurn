-- OAuth-connected sending inboxes (Gmail now, Outlook reserved for phase 2).
-- Tokens are encrypted at rest by the app layer (src/lib/inbox/token-crypto.ts)
-- before being stored here — this table never holds plaintext tokens.

create table connected_inboxes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null, -- FK to auth.users reinstated once auth is added
  provider text not null check (provider in ('gmail', 'outlook')),
  email_address text not null,
  access_token_enc text not null,
  refresh_token_enc text not null,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  status text not null default 'connected'
    check (status in ('connected', 'revoked', 'error')),
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, email_address)
);

alter table connected_inboxes enable row level security;

-- Sensitive table: users may read their own connected inboxes (to show
-- connection status in the UI) but token columns are only ever written by
-- the service-role client (OAuth callback route, token refresh, cron).
create policy connected_inboxes_owner_select on connected_inboxes
  for select using (auth.uid() = user_id);
create policy connected_inboxes_service_role_all on connected_inboxes
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
