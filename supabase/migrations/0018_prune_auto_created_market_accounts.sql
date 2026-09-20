-- Remove market_accounts rows that were auto-created by scanning.
--
-- Scans used to upsert an account row for the author of every discovered
-- post — dozens per keyword per run — which filled this table and listed
-- every one of those authors in the "From" filter. Accounts are now only
-- created when the user explicitly follows someone, so the rows that were
-- never followed are all scan residue and carry no user intent.
--
-- Mentions keep author_name / author_handle / author_avatar_url on their own
-- rows, so detaching them here loses nothing that is displayed. Followed
-- accounts, and any mention linked to one, are left untouched.

update market_mentions
set account_id = null
where account_id in (
  select id from market_accounts where is_followed is not true
);

delete from market_accounts
where is_followed is not true;
