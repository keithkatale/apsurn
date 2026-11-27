-- Passwordless sign-in: one-time email links. Only a hash of the token is stored. Safe to re-run.

create table if not exists magic_links (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token_hash text not null unique,
  next_path text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists magic_links_email_idx on magic_links (email, created_at desc);

alter table magic_links enable row level security;
-- No policies: only the service role (server code) reads or writes this table.
revoke all on magic_links from anon, authenticated;
