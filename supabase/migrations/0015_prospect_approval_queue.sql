-- Company-level fields for the ICP-scored approval queue. icp_fit_score and
-- data_confidence already exist on prospect_companies (0002/0008); status
-- already supports 'qualified'/'rejected' (0002) but nothing wrote them until
-- now — the approval queue is what sets it going forward.

alter table prospect_companies add column qualify_reason text;
alter table prospect_companies add column evidence jsonb not null default '[]'::jsonb;
alter table prospect_companies add column recommended_contact_id uuid references contacts (id) on delete set null;
