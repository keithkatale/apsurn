-- Durable copies for the agentic directory scraper.
--
-- scrape_snapshots: our own raw copy of every page the scraping agent reads,
-- so leads can be re-extracted/audited without re-fetching the source.
--
-- directory_sources: remembers productive public directories per ICP so future
-- runs can revisit high-yield listings instead of rediscovering them.
--
-- Both are service-role only, mirroring the canonical prospecting index
-- (indexed_companies etc. in 0008_ai_prospecting_index.sql).

create table scrape_snapshots (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references prospecting_runs (id) on delete set null,
  url text not null,
  final_url text,
  http_status int,
  content_hash text,
  title text,
  text text,
  html text,
  rendered boolean not null default false,
  page_kind text not null default 'unknown'
    check (page_kind in ('unknown', 'directory_listing', 'company_detail', 'company_site', 'search')),
  fetched_at timestamptz not null default now()
);

-- One current snapshot per URL per run; re-fetching within a run overwrites.
create unique index scrape_snapshots_run_url_idx on scrape_snapshots (run_id, url);
create index scrape_snapshots_url_idx on scrape_snapshots (url);
create index scrape_snapshots_hash_idx on scrape_snapshots (content_hash);

create table directory_sources (
  id uuid primary key default gen_random_uuid(),
  host text not null unique,
  example_url text,
  kind text not null default 'directory'
    check (kind in ('directory', 'association', 'chamber', 'listing', 'other')),
  icp_tags text[] not null default '{}',
  yield_count int not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index directory_sources_icp_tags_idx on directory_sources using gin (icp_tags);

alter table scrape_snapshots enable row level security;
alter table directory_sources enable row level security;

create policy scrape_snapshots_service on scrape_snapshots for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy directory_sources_service on directory_sources for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
