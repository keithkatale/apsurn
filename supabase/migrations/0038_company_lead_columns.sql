-- Columns the prospect list shows for every company. Buyer, insight and angle
-- are written by Copilot from the blueprint. Scrapers leave them null.
alter table prospect_companies
  add column if not exists their_buyer text,
  add column if not exists key_insight text,
  add column if not exists outreach_angle text,
  add column if not exists hiring boolean,
  add column if not exists source_url text;
