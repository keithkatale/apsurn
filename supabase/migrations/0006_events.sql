-- First-party analytics and admin dashboard support.
--  * apsurn_events: pageviews and key product actions (no IP address or fingerprint is stored).
--  * admin_* functions: aggregates for the /admin dashboard. They are SECURITY DEFINER and callable only by the
--    service role, so they can read auth.users without exposing it to anyone else.
-- Safe to re-run. Does not touch any existing table.

create table if not exists apsurn_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name text not null,
  user_id uuid,
  anon_id text,
  path text,
  referrer_host text,
  device text,
  props jsonb not null default '{}'::jsonb
);
create index if not exists apsurn_events_name_idx on apsurn_events (name, created_at desc);
create index if not exists apsurn_events_user_idx on apsurn_events (user_id, created_at desc);
create index if not exists apsurn_events_created_idx on apsurn_events (created_at desc);

alter table apsurn_events enable row level security;
drop policy if exists apsurn_events_service_role_all on apsurn_events;
create policy apsurn_events_service_role_all on apsurn_events
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- Guest = anonymous, flagged in metadata, or the placeholder guest address.
create or replace function admin_is_guest(u auth.users) returns boolean
language sql immutable as $$
  select coalesce(u.is_anonymous, false)
      or coalesce(u.raw_user_meta_data->>'guest', '') = 'true'
      or lower(coalesce(u.email, '')) like '%@guest.apsurn.com'
$$;

create or replace function admin_user_counts()
returns table (total bigint, guests bigint, registered bigint, new_7d bigint, new_30d bigint,
               active_1d bigint, active_7d bigint, active_30d bigint)
language sql security definer set search_path = public, auth as $$
  select count(*),
         count(*) filter (where admin_is_guest(u)),
         count(*) filter (where not admin_is_guest(u)),
         count(*) filter (where not admin_is_guest(u) and u.created_at > now() - interval '7 days'),
         count(*) filter (where not admin_is_guest(u) and u.created_at > now() - interval '30 days'),
         count(*) filter (where not admin_is_guest(u) and u.last_sign_in_at > now() - interval '1 day'),
         count(*) filter (where not admin_is_guest(u) and u.last_sign_in_at > now() - interval '7 days'),
         count(*) filter (where not admin_is_guest(u) and u.last_sign_in_at > now() - interval '30 days')
  from auth.users u
$$;

create or replace function admin_daily_series(p_days int)
returns table (day date, visitors bigint, pageviews bigint, signups bigint, logins bigint,
               analyses bigint, emails_sent bigint, scans bigint, new_users bigint)
language sql security definer set search_path = public, auth as $$
  with days as (
    select generate_series((current_date - (greatest(p_days, 1) - 1))::timestamp, current_date::timestamp, interval '1 day')::date as d
  ),
  ev as (
    select created_at::date as d,
           count(distinct anon_id) filter (where name = 'pageview') as visitors,
           count(*) filter (where name = 'pageview') as pageviews,
           count(*) filter (where name = 'signup') as signups,
           count(*) filter (where name = 'login') as logins,
           count(*) filter (where name = 'analyze') as analyses,
           count(*) filter (where name = 'email_sent') as emails_sent,
           count(*) filter (where name = 'scan') as scans
    from apsurn_events
    where created_at >= current_date - (greatest(p_days, 1) - 1)
    group by 1
  ),
  nu as (
    select created_at::date as d, count(*) as n
    from auth.users u
    where not admin_is_guest(u) and created_at >= current_date - (greatest(p_days, 1) - 1)
    group by 1
  )
  select days.d, coalesce(ev.visitors, 0), coalesce(ev.pageviews, 0), coalesce(ev.signups, 0),
         coalesce(ev.logins, 0), coalesce(ev.analyses, 0), coalesce(ev.emails_sent, 0),
         coalesce(ev.scans, 0), coalesce(nu.n, 0)
  from days left join ev on ev.d = days.d left join nu on nu.d = days.d
  order by days.d
$$;

-- Distinct visitors (anonymous id, or user id when there is none) reaching each stage.
create or replace function admin_funnel(p_days int)
returns table (step text, ord int, actors bigint)
language sql security definer set search_path = public as $$
  with e as (
    select name, coalesce(anon_id, user_id::text) as actor
    from apsurn_events
    where created_at >= now() - make_interval(days => greatest(p_days, 1))
  )
  select s.step, s.ord, count(distinct e.actor)
  from (values ('Visited the site', 1, 'pageview'), ('Analyzed a website', 2, 'analyze'),
               ('Signed up', 3, 'signup'), ('Started checkout', 4, 'checkout_started'),
               ('Paid', 5, 'payment_succeeded'), ('Sent an email', 6, 'email_sent')) as s(step, ord, ev)
  left join e on e.name = s.ev
  group by s.step, s.ord
  order by s.ord
$$;

create or replace function admin_top_values(p_days int, p_column text, p_limit int)
returns table (value text, hits bigint, visitors bigint)
language sql security definer set search_path = public as $$
  select coalesce(case p_column when 'path' then path when 'referrer' then referrer_host else device end, '(direct)') as value,
         count(*), count(distinct anon_id)
  from apsurn_events
  where name = 'pageview' and created_at >= now() - make_interval(days => greatest(p_days, 1))
  group by 1
  order by 2 desc
  limit least(greatest(p_limit, 1), 50)
$$;

create or replace function admin_users_page(p_search text, p_limit int, p_offset int)
returns table (id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz, is_guest boolean,
               plan_key text, subscription_status text, credits int, leads bigint, sends bigint,
               signals bigint, total bigint)
language plpgsql security definer set search_path = public, auth as $$
begin
  return query
  with base as (
    select u.id, u.email::text as email, u.created_at, u.last_sign_in_at, admin_is_guest(u) as is_guest
    from auth.users u
    where p_search is null or p_search = '' or u.email ilike '%' || p_search || '%'
  )
  select b.id, b.email, b.created_at, b.last_sign_in_at, b.is_guest,
         ba.plan_key::text, ba.subscription_status::text,
         (coalesce(ba.plan_credits, 0) + coalesce(ba.topup_credits, 0))::int,
         (select count(*) from prospect_companies pc where pc.user_id = b.id),
         (select count(*) from campaign_sends cs where cs.user_id = b.id),
         (select count(*) from signals s where s.user_id = b.id),
         (select count(*) from base)
  from base b
  left join billing_accounts ba on ba.user_id = b.id
  order by b.created_at desc
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end
$$;

create or replace function admin_subscribers()
returns table (user_id uuid, email text, plan_key text, subscription_status text, current_period_end timestamptz,
               cancel_at_period_end boolean, credits int, created_at timestamptz)
language sql security definer set search_path = public, auth as $$
  select ba.user_id, u.email::text, ba.plan_key::text, ba.subscription_status::text, ba.current_period_end,
         coalesce(ba.cancel_at_period_end, false),
         (coalesce(ba.plan_credits, 0) + coalesce(ba.topup_credits, 0))::int, ba.created_at
  from billing_accounts ba
  left join auth.users u on u.id = ba.user_id
  order by ba.created_at desc
  limit 500
$$;

create or replace function admin_recent_events(p_limit int, p_name text)
returns table (id bigint, created_at timestamptz, name text, email text, path text, props jsonb)
language sql security definer set search_path = public, auth as $$
  select e.id, e.created_at, e.name, u.email::text, e.path, e.props
  from apsurn_events e
  left join auth.users u on u.id = e.user_id
  where e.name <> 'pageview' and (p_name is null or p_name = '' or e.name = p_name)
  order by e.created_at desc
  limit least(greatest(p_limit, 1), 300)
$$;

create or replace function admin_credit_usage(p_days int)
returns table (reason text, events bigint, credits bigint)
language sql security definer set search_path = public as $$
  select l.reason::text, count(*), coalesce(sum(l.delta), 0)::bigint
  from billing_credit_ledger l
  where l.created_at >= now() - make_interval(days => greatest(p_days, 1))
  group by l.reason
  order by 2 desc
$$;

create or replace function admin_signal_sources(p_days int)
returns table (source text, signals bigint, avg_score numeric, leads bigint)
language plpgsql security definer set search_path = public as $$
begin
  -- plpgsql so this can be created even before the listening tables (0005) exist.
  return query
  select s.source::text, count(*), round(avg(s.score), 1), count(*) filter (where s.status = 'lead')
  from signals s
  where s.created_at >= now() - make_interval(days => greatest(p_days, 1))
  group by s.source
  order by 2 desc;
end
$$;

-- Only the service role may call these.
do $$
declare f text;
begin
  for f in select unnest(array[
    'admin_user_counts()', 'admin_daily_series(int)', 'admin_funnel(int)', 'admin_top_values(int,text,int)',
    'admin_users_page(text,int,int)', 'admin_subscribers()', 'admin_recent_events(int,text)',
    'admin_credit_usage(int)', 'admin_signal_sources(int)'
  ]) loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
