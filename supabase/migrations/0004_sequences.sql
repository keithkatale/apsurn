-- Multi-step email sequences, their steps, and per-contact enrollment state.

create table sequences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null, -- FK to auth.users reinstated once auth is added
  company_id uuid not null references companies (id) on delete cascade,
  name text not null,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused', 'archived')),
  from_inbox_id uuid references connected_inboxes (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sequences_company_id_idx on sequences (company_id);

create table sequence_steps (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references sequences (id) on delete cascade,
  step_order int not null,
  delay_days int not null default 0,
  subject_template text,
  body_template text not null,
  stop_on_reply boolean not null default true,
  unique (sequence_id, step_order)
);

create table enrollments (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references sequences (id) on delete cascade,
  contact_id uuid not null references contacts (id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'completed', 'replied', 'stopped', 'bounced', 'unsubscribed')),
  current_step int not null default 0,
  next_send_at timestamptz,
  thread_id text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (sequence_id, contact_id)
);

-- The scheduler's hot path: "give me due, active enrollments".
create index enrollments_next_send_idx on enrollments (next_send_at)
  where status = 'active';

alter table sequences enable row level security;
alter table sequence_steps enable row level security;
alter table enrollments enable row level security;

create policy sequences_owner_all on sequences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy sequences_service_role_all on sequences
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy sequence_steps_owner_all on sequence_steps
  for all using (
    auth.uid() = (select user_id from sequences where sequences.id = sequence_steps.sequence_id)
  ) with check (
    auth.uid() = (select user_id from sequences where sequences.id = sequence_steps.sequence_id)
  );
create policy sequence_steps_service_role_all on sequence_steps
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy enrollments_owner_all on enrollments
  for all using (
    auth.uid() = (select user_id from sequences where sequences.id = enrollments.sequence_id)
  ) with check (
    auth.uid() = (select user_id from sequences where sequences.id = enrollments.sequence_id)
  );
create policy enrollments_service_role_all on enrollments
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
