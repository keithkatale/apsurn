export const LEAD_STATUSES = ["new", "qualified", "contacted", "replied", "won", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const OUTREACH_OPTIONS = [
  { id: "in_campaign", label: "In campaign" },
  { id: "not_in_campaign", label: "Not in campaign" },
  { id: "contacted", label: "Contacted" },
  { id: "not_contacted", label: "Not contacted" },
] as const;
export type OutreachState = (typeof OUTREACH_OPTIONS)[number]["id"];

export function matchesOutreachTab(
  contact: { outreach?: OutreachState; in_campaign?: boolean; contacted?: boolean },
  tab: OutreachState,
): boolean {
  if (tab === "not_in_campaign") return !contact.in_campaign;
  if (tab === "not_contacted") return !contact.contacted;
  if (tab === "in_campaign") return Boolean(contact.in_campaign);
  return contact.outreach === "contacted" || Boolean(contact.contacted);
}

export interface ContactRow {
  id: string;
  full_name: string | null;
  title: string | null;
  email: string | null;
  email_status: string;
  phone: string | null;
  linkedin_url: string | null;
  contact_origin: string;
  confidence: number | null;
  evidence: Array<{ url: string; observedAt: string }>;
  lead_status: LeadStatus;
  archived_at: string | null;
  qualify_reason: string | null;
  outreach?: OutreachState;
  in_campaign?: boolean;
  contacted?: boolean;
  campaign_name?: string | null;
}

export interface ProspectRow {
  id: string;
  name: string;
  domain: string;
  industry: string | null;
  location: string | null;
  icp_fit_score: number | null;
  data_confidence: number | null;
  status: string;
  qualify_reason: string | null;
  evidence: Array<{ url: string; excerpt?: string; observedAt: string }>;
  recommended_contact_id: string | null;
  archived_at: string | null;
  list_id?: string | null;
  list_name?: string | null;
  contacts: ContactRow[];
}
