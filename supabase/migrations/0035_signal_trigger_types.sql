-- Launch and accelerator signals (free public sources) are recorded alongside the original triggers.
alter table prospect_signals drop constraint if exists prospect_signals_trigger_type_check;
alter table prospect_signals
  add constraint prospect_signals_trigger_type_check
  check (trigger_type in ('hiring', 'funding_news', 'social_pain', 'tech_website', 'launch', 'accelerator'));
