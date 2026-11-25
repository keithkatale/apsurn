-- Billing: Dodo Payments subscriptions + an app-side credit ledger.
--
-- Credits live in two buckets:
--   plan_credits  — granted each billing cycle, reset (not rolled over) on renewal
--   topup_credits — bought one-off, never expire
-- Spending drains plan credits first, then top-up credits.
--
-- Everything here is written only by the service-role client (webhook + API routes).
-- Run this once in the Supabase SQL editor. It is additive and safe to re-run.

create table if not exists billing_accounts (
  user_id uuid primary key,
  dodo_customer_id text unique,
  plan_key text check (plan_key in ('startup', 'growth', 'pro')),
  subscription_id text unique,
  subscription_status text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  plan_credits integer not null default 0 check (plan_credits >= 0),
  topup_credits integer not null default 0 check (topup_credits >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists billing_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  bucket text not null check (bucket in ('plan', 'topup')),
  delta integer not null,
  reason text not null,
  -- Idempotency key: a webhook id / payment id / action id. Replays are ignored.
  ref text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists billing_credit_ledger_ref_uidx on billing_credit_ledger (ref) where ref is not null;
create index if not exists billing_credit_ledger_user_idx on billing_credit_ledger (user_id, created_at desc);

alter table billing_accounts enable row level security;
alter table billing_credit_ledger enable row level security;

drop policy if exists billing_accounts_owner_select on billing_accounts;
create policy billing_accounts_owner_select on billing_accounts
  for select using (auth.uid() = user_id);
drop policy if exists billing_accounts_service_role_all on billing_accounts;
create policy billing_accounts_service_role_all on billing_accounts
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists billing_credit_ledger_owner_select on billing_credit_ledger;
create policy billing_credit_ledger_owner_select on billing_credit_ledger
  for select using (auth.uid() = user_id);
drop policy if exists billing_credit_ledger_service_role_all on billing_credit_ledger;
create policy billing_credit_ledger_service_role_all on billing_credit_ledger
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- Grant (or reset) credits. Idempotent on p_ref. Returns the new total balance.
--   p_reset = true (plan bucket only): set the bucket to p_amount instead of adding to it.
create or replace function grant_credits(
  p_user uuid,
  p_bucket text,
  p_amount integer,
  p_reason text,
  p_ref text default null,
  p_reset boolean default false
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  acct billing_accounts%rowtype;
  v_delta integer;
begin
  if p_bucket not in ('plan', 'topup') then
    raise exception 'invalid bucket %', p_bucket;
  end if;

  insert into billing_accounts (user_id) values (p_user) on conflict (user_id) do nothing;
  select * into acct from billing_accounts where user_id = p_user for update;

  if p_ref is not null and exists (select 1 from billing_credit_ledger where ref = p_ref) then
    return acct.plan_credits + acct.topup_credits;
  end if;

  if p_bucket = 'plan' then
    v_delta := case when p_reset then p_amount - acct.plan_credits else p_amount end;
    update billing_accounts
      set plan_credits = greatest(0, plan_credits + v_delta), updated_at = now()
      where user_id = p_user;
  else
    v_delta := p_amount;
    update billing_accounts
      set topup_credits = greatest(0, topup_credits + v_delta), updated_at = now()
      where user_id = p_user;
  end if;

  insert into billing_credit_ledger (user_id, bucket, delta, reason, ref)
    values (p_user, p_bucket, v_delta, p_reason, p_ref);

  select * into acct from billing_accounts where user_id = p_user;
  return acct.plan_credits + acct.topup_credits;
end;
$$;

-- Spend credits atomically (plan credits first, then top-ups).
-- Returns the new total balance, or -1 if the balance is too low. Idempotent on p_ref.
create or replace function spend_credits(
  p_user uuid,
  p_amount integer,
  p_reason text,
  p_ref text default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  acct billing_accounts%rowtype;
  from_plan integer;
  from_topup integer;
begin
  if p_amount <= 0 then
    select * into acct from billing_accounts where user_id = p_user;
    return coalesce(acct.plan_credits + acct.topup_credits, 0);
  end if;

  insert into billing_accounts (user_id) values (p_user) on conflict (user_id) do nothing;
  select * into acct from billing_accounts where user_id = p_user for update;

  if p_ref is not null and exists (select 1 from billing_credit_ledger where ref like p_ref || ':%') then
    return acct.plan_credits + acct.topup_credits;
  end if;

  if acct.plan_credits + acct.topup_credits < p_amount then
    return -1;
  end if;

  from_plan := least(acct.plan_credits, p_amount);
  from_topup := p_amount - from_plan;

  update billing_accounts
    set plan_credits = plan_credits - from_plan,
        topup_credits = topup_credits - from_topup,
        updated_at = now()
    where user_id = p_user;

  if from_plan > 0 then
    insert into billing_credit_ledger (user_id, bucket, delta, reason, ref)
      values (p_user, 'plan', -from_plan, p_reason, case when p_ref is null then null else p_ref || ':plan' end);
  end if;
  if from_topup > 0 then
    insert into billing_credit_ledger (user_id, bucket, delta, reason, ref)
      values (p_user, 'topup', -from_topup, p_reason, case when p_ref is null then null else p_ref || ':topup' end);
  end if;

  select * into acct from billing_accounts where user_id = p_user;
  return acct.plan_credits + acct.topup_credits;
end;
$$;

-- These run with elevated rights; only the service role may call them.
revoke all on function grant_credits(uuid, text, integer, text, text, boolean) from public, anon, authenticated;
revoke all on function spend_credits(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function grant_credits(uuid, text, integer, text, text, boolean) to service_role;
grant execute on function spend_credits(uuid, integer, text, text) to service_role;

notify pgrst, 'reload schema';
