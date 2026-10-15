-- Product usage events (who visits, from where, what they use, when they come back),
-- marketing email preferences, and the log of emails sent from the admin area.

create table app_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  visitor_id text not null,
  session_id text not null,
  user_id uuid,
  event text not null default 'pageview',
  path text not null,
  referrer_host text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  device text,
  country text,
  meta jsonb not null default '{}'::jsonb
);

create index app_events_created_idx on app_events (created_at desc);
create index app_events_user_idx on app_events (user_id, created_at desc);
create index app_events_visitor_idx on app_events (visitor_id, created_at desc);
create index app_events_session_idx on app_events (session_id);

alter table app_events enable row level security;
create policy app_events_service_role_all on app_events
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create table email_preferences (
  user_id uuid primary key,
  marketing_opt_out boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table email_preferences enable row level security;
create policy email_preferences_service_role_all on email_preferences
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create table admin_emails (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('broadcast', 'individual', 'test')),
  subject text not null,
  html text not null,
  audience text,
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table admin_email_recipients (
  id bigserial primary key,
  email_id uuid not null references admin_emails (id) on delete cascade,
  user_id uuid,
  email text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  error text,
  sent_at timestamptz
);

create index admin_email_recipients_email_idx on admin_email_recipients (email_id);

alter table admin_emails enable row level security;
alter table admin_email_recipients enable row level security;
create policy admin_emails_service_role_all on admin_emails
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy admin_email_recipients_service_role_all on admin_email_recipients
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
