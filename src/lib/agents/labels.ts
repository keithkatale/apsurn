import type { SpecialistId } from "./types";

export const AGENT_DISPLAY_NAME: Record<SpecialistId, string> = {
  researcher: "Researcher",
  listener: "Listener",
  writer: "Writer",
  operator: "Operator",
};

export const AGENT_TOOL_LABELS: Record<string, string> = {
  get_account_snapshot: "Checking your account",
  get_analytics_summary: "Checking analytics",
  delegate_to_agent: "Delegating",
  get_agent_status: "Checking agent status",
  list_prospect_companies: "Looking up companies",
  list_contacts: "Looking up contacts",
  source_leads: "Sourcing leads",
  save_sourced_leads: "Saving leads to Prospects",
  start_prospecting_run: "Starting a prospecting run",
  get_prospecting_run: "Checking prospecting run",
  cancel_prospecting_run: "Cancelling prospecting run",
  set_company_status: "Updating company status",
  list_market_keywords: "Listing tracked keywords",
  list_market_accounts: "Listing social accounts",
  list_market_mentions: "Listing mentions",
  add_market_keyword: "Adding a keyword",
  set_keyword_active: "Updating a keyword",
  follow_account_by_handle: "Following an account",
  update_market_account_follow: "Updating follow status",
  update_market_mention: "Updating a mention",
  trigger_market_scan: "Starting a market scan",
  convert_mention_to_prospect: "Saving a mention as a lead",
  get_sequence_overview: "Checking sequences",
  draft_outreach_email: "Drafting an email",
  update_contact_status: "Updating contact status",
  archive_contacts: "Archiving contacts",
  archive_prospect_companies: "Archiving companies",
  create_sequence: "Creating sequence",
  enroll_contacts: "Enrolling contacts",
  activate_sequence: "Activating sequence",
  run_send_pass: "Running a send pass",
  send_email_now: "Sending an email",
};

export const TOOL_TO_AGENT: Record<string, SpecialistId> = {
  list_prospect_companies: "researcher",
  source_leads: "researcher",
  save_sourced_leads: "researcher",
  start_prospecting_run: "researcher",
  get_prospecting_run: "researcher",
  cancel_prospecting_run: "researcher",
  set_company_status: "researcher",
  list_market_keywords: "listener",
  list_market_accounts: "listener",
  list_market_mentions: "listener",
  add_market_keyword: "listener",
  set_keyword_active: "listener",
  follow_account_by_handle: "listener",
  update_market_account_follow: "listener",
  update_market_mention: "listener",
  trigger_market_scan: "listener",
  convert_mention_to_prospect: "listener",
  draft_outreach_email: "writer",
  update_contact_status: "operator",
  archive_contacts: "operator",
  archive_prospect_companies: "operator",
  create_sequence: "operator",
  enroll_contacts: "operator",
  activate_sequence: "operator",
  run_send_pass: "operator",
  send_email_now: "operator",
};

export function toolLabel(name: string): string {
  return AGENT_TOOL_LABELS[name] ?? name;
}

export function toolAgent(name: string): SpecialistId | undefined {
  return TOOL_TO_AGENT[name];
}
