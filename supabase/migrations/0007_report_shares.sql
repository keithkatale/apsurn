-- Shareable report links: apsurn.com/r/<slug> shows one generated setup (ICP, blueprint, competitors, leads,
-- email sequences) for a business the admin entered. Safe to re-run.
-- The slug is the only credential, so it carries a random suffix. Revoking sets revoked_at.
-- Requires 0001 (companies) and 0006 (events).

create table if not exists report_shares (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table report_shares add column if not exists source_url text;
alter table report_shares add column if not exists status text not null default 'ready';
create index if not exists report_shares_creator_idx on report_shares (created_by, created_at desc);

alter table report_shares enable row level security;
-- No policies on purpose: only the service role (server code) reads or writes these tables.
revoke all on report_shares from anon, authenticated;

-- Who kept a shared report's leads. One row per account: an account can only be seeded once.
create table if not exists report_claims (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  user_id uuid not null unique,
  company_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists report_claims_slug_idx on report_claims (slug);
alter table report_claims enable row level security;
revoke all on report_claims from anon, authenticated;

-- Reports are built under a hidden "report owner" account per report. Keep those out of the user counts.
create or replace function admin_user_counts()
returns table (total bigint, guests bigint, registered bigint, new_7d bigint, new_30d bigint,
               active_1d bigint, active_7d bigint, active_30d bigint)
language sql security definer set search_path = public, auth as $$
  select count(*),
         count(*) filter (where admin_is_guest(u)),
         count(*) filter (where not admin_is_guest(u)),
         count(*) filter (where not admin_is_guest(u) and u.created_at > now() - interval '7 days'),
         count(*) filter (where not admin_is_guest(u) and u.created_at > now() - interval '30 days'),
         count(*) filter (where not admin_is_guest(u) and u.last_sign_in_at > now() - interval '1 day'),
         count(*) filter (where not admin_is_guest(u) and u.last_sign_in_at > now() - interval '7 days'),
         count(*) filter (where not admin_is_guest(u) and u.last_sign_in_at > now() - interval '30 days')
  from auth.users u
  where coalesce(u.raw_user_meta_data->>'report_owner', '') <> 'true'
$$;
revoke all on function admin_user_counts() from public, anon, authenticated;
grant execute on function admin_user_counts() to service_role;

drop function if exists report_share_viewed(text);
