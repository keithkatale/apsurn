-- Privacy-friendly website analytics (adapted from arsbux/data).
-- Tables are prefixed to sit alongside the prospecting schema.

create table analytics_sites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  domain text not null,
  name text not null,
  site_id text unique not null,
  created_at timestamptz not null default now(),
  settings jsonb not null default '{}'::jsonb
);

create index analytics_sites_user_id_idx on analytics_sites (user_id);

create table analytics_page_views (
  id bigserial primary key,
  site_id text not null references analytics_sites (site_id) on delete cascade,
  visitor_id uuid not null,
  session_id uuid not null,
  url text not null,
  path text not null,
  title text,
  referrer text,
  referrer_domain text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  browser text,
  browser_version text,
  os text,
  os_version text,
  device_type text,
  screen_width int,
  screen_height int,
  country text,
  country_code text,
  region text,
  city text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  timestamp timestamptz not null default now(),
  duration int
);

create index analytics_page_views_site_timestamp_idx
  on analytics_page_views (site_id, timestamp desc);
create index analytics_page_views_visitor_session_idx
  on analytics_page_views (visitor_id, session_id);
create index analytics_page_views_path_idx
  on analytics_page_views (site_id, path);
create index analytics_page_views_referrer_idx
  on analytics_page_views (site_id, referrer_domain);

create table analytics_sessions (
  id uuid primary key default gen_random_uuid(),
  site_id text not null references analytics_sites (site_id) on delete cascade,
  visitor_id uuid not null,
  session_id uuid not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration int,
  page_views int not null default 1,
  bounced boolean not null default true,
  entry_url text,
  entry_referrer text,
  exit_url text,
  country_code text,
  city text,
  device_type text,
  browser text,
  os text,
  unique (site_id, session_id)
);

create index analytics_sessions_site_started_idx
  on analytics_sessions (site_id, started_at desc);

create table analytics_active_visitors (
  site_id text not null,
  visitor_id uuid not null,
  session_id uuid not null,
  last_seen timestamptz not null default now(),
  current_page text,
  country_code text,
  city text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  device_type text,
  referrer_domain text,
  primary key (site_id, visitor_id)
);

create index analytics_active_visitors_last_seen_idx
  on analytics_active_visitors (last_seen);

create table analytics_events (
  id bigserial primary key,
  site_id text not null references analytics_sites (site_id) on delete cascade,
  visitor_id uuid not null,
  session_id uuid not null,
  event_name text not null,
  event_data jsonb,
  url text,
  timestamp timestamptz not null default now()
);

create index analytics_events_site_event_idx
  on analytics_events (site_id, event_name, timestamp desc);

alter table analytics_sites enable row level security;
alter table analytics_page_views enable row level security;
alter table analytics_sessions enable row level security;
alter table analytics_active_visitors enable row level security;
alter table analytics_events enable row level security;

create policy analytics_sites_owner_all on analytics_sites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy analytics_sites_service_role_all on analytics_sites
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy analytics_page_views_owner_select on analytics_page_views
  for select using (
    exists (
      select 1 from analytics_sites
      where analytics_sites.site_id = analytics_page_views.site_id
        and analytics_sites.user_id = auth.uid()
    )
  );
create policy analytics_page_views_service_role_all on analytics_page_views
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy analytics_sessions_owner_select on analytics_sessions
  for select using (
    exists (
      select 1 from analytics_sites
      where analytics_sites.site_id = analytics_sessions.site_id
        and analytics_sites.user_id = auth.uid()
    )
  );
create policy analytics_sessions_service_role_all on analytics_sessions
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy analytics_active_visitors_owner_select on analytics_active_visitors
  for select using (
    exists (
      select 1 from analytics_sites
      where analytics_sites.site_id = analytics_active_visitors.site_id
        and analytics_sites.user_id = auth.uid()
    )
  );
create policy analytics_active_visitors_service_role_all on analytics_active_visitors
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy analytics_events_owner_select on analytics_events
  for select using (
    exists (
      select 1 from analytics_sites
      where analytics_sites.site_id = analytics_events.site_id
        and analytics_sites.user_id = auth.uid()
    )
  );
create policy analytics_events_service_role_all on analytics_events
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
