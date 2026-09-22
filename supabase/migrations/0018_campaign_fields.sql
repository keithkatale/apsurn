-- Campaign metadata on sequences (setup wizard + campaigns page).

alter table sequences add column if not exists description text;
alter table sequences add column if not exists pain text;
alter table sequences add column if not exists targeting jsonb not null default '[]'::jsonb;
alter table sequences add column if not exists sample_accounts text[] not null default '{}';
alter table sequences add column if not exists estimated_volume int;
alter table sequences add column if not exists segment_key text;
