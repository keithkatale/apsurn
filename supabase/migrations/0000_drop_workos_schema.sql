-- Reset the shared Supabase project (ref ijufvisaoafotmpqjleb) for reuse by
-- the new apsurn AI SDR platform. The WorkOS store-builder app that
-- previously owned this project's `public` schema is being retired; this
-- drops all of its tables/views/functions/types so the new schema below can
-- be applied cleanly.
--
-- DESTRUCTIVE AND IRREVERSIBLE. Before running this:
--   1. Take a backup (Supabase Dashboard -> Database -> Backups, or
--      `pg_dump` against the project's connection string).
--   2. Confirm nobody still depends on the WorkOS store-builder data
--      (profiles, accounts, ledger_entries, stores, products, orders, etc.)
--      — it will be gone after this runs.
--
-- Supabase Auth (the `auth` schema / `auth.users`) is NOT touched — only the
-- app-level `public` schema is dropped and recreated. Existing WorkOS user
-- accounts remain valid; the new app's tables key off the same `auth.uid()`.

drop schema if exists public cascade;
create schema public;

-- Restore the default grants Supabase expects on a fresh `public` schema.
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
alter default privileges in schema public grant all on tables to postgres, service_role;
alter default privileges in schema public grant all on sequences to postgres, service_role;
alter default privileges in schema public grant all on functions to postgres, service_role;
