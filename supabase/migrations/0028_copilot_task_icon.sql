-- Conversations are presented as "tasks" in the UI; give each one a stable
-- icon (a "mi:<material symbol name>" marker, same convention as
-- sequences.icon_svg) picked from the first message's content alongside its
-- AI-generated title.
alter table copilot_conversations add column icon text;
