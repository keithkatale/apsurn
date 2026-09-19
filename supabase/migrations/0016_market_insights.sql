-- Market insights: keyword-based social listening across Twitter/X, Reddit,
-- YouTube and LinkedIn. Keywords are scoped to the user's company; mentions
-- are AI-assisted web-search results, deduped per user by source URL.
--
-- Mentions are treated as ephemeral: each re-scan of a keyword replaces its
-- previously-unsaved mentions with the fresh results (see scanKeyword in
-- src/lib/market/mutations.ts) — only mentions the user has explicitly
-- saved survive a re-scan indefinitely.
--
-- Written to be safely re-runnable: uses "if not exists" everywhere,
-- including for columns added after the first version of this file, so it
-- can be re-applied on top of a partially-applied earlier run.

create table if not exists market_keywords (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  company_id uuid not null references companies(id) on delete cascade,
  keyword text not null,
  platforms text[] not null default array['twitter', 'reddit', 'youtube', 'linkedin'],
  is_active boolean not null default true,
  last_scanned_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists market_keywords_company_id_idx on market_keywords(company_id);

-- One row per distinct author/account seen across scans, so posts can be
-- attributed to a person/handle rather than just floating text, and so a
-- user can "follow" an account to keep tracking its content going forward.
create table if not exists market_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  platform text not null check (platform in ('twitter', 'reddit', 'youtube', 'linkedin')),
  handle text not null,
  name text,
  avatar_url text,
  is_followed boolean not null default false,
  last_scanned_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, platform, handle)
);

create index if not exists market_accounts_company_id_idx on market_accounts(company_id);

create table if not exists market_mentions (
  id uuid primary key default gen_random_uuid(),
  keyword_id uuid references market_keywords(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  platform text not null check (platform in ('twitter', 'reddit', 'youtube', 'linkedin')),
  url text not null,
  author_name text,
  author_handle text,
  author_avatar_url text,
  content text not null,
  posted_at timestamptz,
  engagement jsonb not null default '{}'::jsonb,
  comments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (company_id, url)
);

-- Columns added after the first version of this table — safe to re-run.
alter table market_mentions alter column keyword_id drop not null;
alter table market_mentions add column if not exists account_id uuid references market_accounts(id) on delete set null;
alter table market_mentions add column if not exists media_url text;
alter table market_mentions add column if not exists is_saved boolean not null default false;
alter table market_mentions add column if not exists needs_follow_up boolean not null default false;
alter table market_mentions add column if not exists sentiment text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'market_mentions_sentiment_check'
  ) then
    alter table market_mentions
      add constraint market_mentions_sentiment_check check (sentiment in ('positive', 'neutral', 'negative'));
  end if;
end $$;

create index if not exists market_mentions_company_id_idx on market_mentions(company_id, created_at desc);
create index if not exists market_mentions_keyword_id_idx on market_mentions(keyword_id);
create index if not exists market_mentions_account_id_idx on market_mentions(account_id);
