create table if not exists email_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text not null,
  code_hash text not null,
  token_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  next_path text,
  created_at timestamptz not null default now()
);

create index if not exists email_verifications_user_created_idx
  on email_verifications (user_id, created_at desc);

create index if not exists email_verifications_token_idx
  on email_verifications (token_hash);

alter table email_verifications enable row level security;
