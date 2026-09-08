-- Send log + event stream, written by the cron scheduler / reply-check sweep
-- (service-role only) and read by the user's dashboard.

create table email_sends (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references enrollments (id) on delete cascade,
  sequence_step_id uuid not null references sequence_steps (id) on delete cascade,
  provider_message_id text,
  thread_id text,
  subject text,
  body text,
  sent_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'bounced')),
  error text,
  created_at timestamptz not null default now()
);

create index email_sends_enrollment_id_idx on email_sends (enrollment_id);

create table email_events (
  id uuid primary key default gen_random_uuid(),
  email_send_id uuid references email_sends (id) on delete cascade,
  enrollment_id uuid not null references enrollments (id) on delete cascade,
  type text not null check (type in ('sent', 'opened', 'replied', 'bounced', 'unsubscribed')),
  metadata jsonb not null default '{}',
  occurred_at timestamptz not null default now()
);

create index email_events_enrollment_id_idx on email_events (enrollment_id);

alter table email_sends enable row level security;
alter table email_events enable row level security;

create policy email_sends_owner_select on email_sends
  for select using (
    auth.uid() = (
      select s.user_id from enrollments e
      join sequences s on s.id = e.sequence_id
      where e.id = email_sends.enrollment_id
    )
  );
create policy email_sends_service_role_all on email_sends
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy email_events_owner_select on email_events
  for select using (
    auth.uid() = (
      select s.user_id from enrollments e
      join sequences s on s.id = e.sequence_id
      where e.id = email_events.enrollment_id
    )
  );
create policy email_events_service_role_all on email_events
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
