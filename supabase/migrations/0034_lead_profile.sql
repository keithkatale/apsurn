-- What the setup accounts table and the lead profile show for each lead:
-- the person's photo and country, and the company's description and country.
alter table prospect_companies add column if not exists description text;
alter table prospect_companies add column if not exists country text;
alter table contacts add column if not exists photo_url text;
alter table contacts add column if not exists country text;
