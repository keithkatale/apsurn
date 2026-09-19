-- Generic app-level key/value settings, starting with which AI provider
-- (openai | openrouter | vertex) the app should route through. A single row
-- keyed 'ai_provider' controls this globally; the admin panel writes it via
-- POST /api/settings/ai-provider.

create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
