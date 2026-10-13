-- Defence in depth: the Supabase anon key is public (it ships to every browser), so every table in the
-- public schema must refuse it. These four tables were created without row level security.
-- All app access goes through the service role, which bypasses RLS, so nothing in the app changes.
-- app_settings holds the stored AI credentials, so it is also revoked from the client roles outright.

alter table app_settings enable row level security;
alter table market_keywords enable row level security;
alter table market_accounts enable row level security;
alter table market_mentions enable row level security;

revoke all on app_settings from anon, authenticated;
revoke all on market_keywords from anon, authenticated;
revoke all on market_accounts from anon, authenticated;
revoke all on market_mentions from anon, authenticated;

create policy app_settings_service_role_all on app_settings
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy market_keywords_service_role_all on market_keywords
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy market_accounts_service_role_all on market_accounts
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy market_mentions_service_role_all on market_mentions
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
