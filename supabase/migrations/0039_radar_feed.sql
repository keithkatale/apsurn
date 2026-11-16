-- Radar feed on top of market listening.
-- Mentions gain a qualify score, a reason, an opener, and a status so the
-- Home tab can show a ranked conversation feed. Saved and dismissed rows
-- survive later scans. Hacker News joins the platform list.

alter table market_keywords add column if not exists intent text;

alter table market_mentions add column if not exists qualify_score int;
alter table market_mentions add column if not exists qualify_reason text;
alter table market_mentions add column if not exists intent text;
alter table market_mentions add column if not exists suggested_opener text;
alter table market_mentions add column if not exists status text not null default 'new';
alter table market_mentions add column if not exists last_seen_at timestamptz;

update market_mentions
set status = 'saved'
where is_saved = true and status = 'new';

-- Inline checks from 0016 were named {table}_platform_check. Drop whatever
-- platform check is actually present, then allow hackernews.
do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as table_name
    from pg_constraint c
    where c.conrelid in ('market_mentions'::regclass, 'market_accounts'::regclass)
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%platform%'
  loop
    execute format('alter table %s drop constraint %I', r.table_name, r.conname);
  end loop;
end $$;

alter table market_mentions
  add constraint market_mentions_platform_check
  check (platform in ('twitter', 'reddit', 'youtube', 'linkedin', 'hackernews'));

alter table market_accounts
  add constraint market_accounts_platform_check
  check (platform in ('twitter', 'reddit', 'youtube', 'linkedin', 'hackernews'));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'market_mentions_status_check') then
    alter table market_mentions
      add constraint market_mentions_status_check
      check (status in ('new', 'saved', 'dismissed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'market_mentions_qualify_score_check') then
    alter table market_mentions
      add constraint market_mentions_qualify_score_check
      check (qualify_score is null or (qualify_score >= 0 and qualify_score <= 100));
  end if;
end $$;

create index if not exists market_mentions_radar_feed_idx
  on market_mentions (company_id, qualify_score desc nulls last)
  where status = 'new';

-- Exact duplicate phrases break an upsert. Keep the oldest row.
delete from market_keywords a
using market_keywords b
where a.company_id = b.company_id
  and a.keyword = b.keyword
  and a.id > b.id;

create unique index if not exists market_keywords_company_keyword_idx
  on market_keywords (company_id, keyword);
