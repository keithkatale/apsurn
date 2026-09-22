-- Dodo Payments subscriptions + AI credit ledger.
-- No free plan: access to AI/send requires an active subscription (incl. trial).

create table if not exists billing_customers (
  user_id uuid primary key,
  dodo_customer_id text not null unique,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  dodo_subscription_id text not null unique,
  dodo_product_id text not null,
  plan_key text not null check (plan_key in ('startup', 'growth', 'pro')),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'on_hold', 'cancelled', 'failed', 'expired')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  cancel_at_next_billing_date boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists billing_subscriptions_user_idx
  on billing_subscriptions (user_id);
create index if not exists billing_subscriptions_user_status_idx
  on billing_subscriptions (user_id, status);

create table if not exists credit_balances (
  user_id uuid primary key,
  balance integer not null default 0 check (balance >= 0),
  lifetime_granted integer not null default 0,
  lifetime_spent integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  delta integer not null,
  balance_after integer not null,
  reason text not null,
  action text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists credit_ledger_user_created_idx
  on credit_ledger (user_id, created_at desc);

create table if not exists billing_webhook_events (
  webhook_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

alter table billing_customers enable row level security;
alter table billing_subscriptions enable row level security;
alter table credit_balances enable row level security;
alter table credit_ledger enable row level security;
alter table billing_webhook_events enable row level security;

create policy billing_customers_owner_select on billing_customers
  for select using (auth.uid() = user_id);
create policy billing_customers_service_role_all on billing_customers
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy billing_subscriptions_owner_select on billing_subscriptions
  for select using (auth.uid() = user_id);
create policy billing_subscriptions_service_role_all on billing_subscriptions
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy credit_balances_owner_select on credit_balances
  for select using (auth.uid() = user_id);
create policy credit_balances_service_role_all on credit_balances
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy credit_ledger_owner_select on credit_ledger
  for select using (auth.uid() = user_id);
create policy credit_ledger_service_role_all on credit_ledger
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy billing_webhook_events_service_role_all on billing_webhook_events
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
