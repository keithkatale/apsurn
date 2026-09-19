-- Persist why a mention was saved, plus the account name the user confirmed
-- at save time. URL and post body already live on market_mentions.

alter table market_mentions add column if not exists saved_account_name text;
alter table market_mentions add column if not exists save_note text;
alter table market_mentions add column if not exists saved_at timestamptz;
