-- Per-step outreach drafts (opener + follow-ups are contact-specific).

alter table outreach_drafts
  add column if not exists sequence_step_id uuid references sequence_steps (id) on delete cascade;

-- Backfill existing rows to the campaign opener (lowest step_order).
update outreach_drafts d
set sequence_step_id = s.id
from (
  select distinct on (sequence_id) id, sequence_id
  from sequence_steps
  order by sequence_id, step_order asc
) s
where d.sequence_step_id is null
  and d.sequence_id = s.sequence_id;

alter table outreach_drafts drop constraint if exists outreach_drafts_user_id_contact_id_sequence_id_key;

create unique index if not exists outreach_drafts_user_contact_sequence_step_uidx
  on outreach_drafts (user_id, contact_id, sequence_id, sequence_step_id);
