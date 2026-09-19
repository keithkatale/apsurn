-- Persist OpenOutFind-style qualify reason (Vertex fit explanation) on contacts.

alter table contacts
  add column if not exists qualify_reason text;
