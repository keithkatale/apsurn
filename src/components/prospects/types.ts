export const LEAD_STATUSES = ["new", "qualified", "contacted", "replied", "won", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

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
}

export interface ProspectRow {
  id: string;
  name: string;
  domain: string;
  industry: string | null;
  location: string | null;
  icp_fit_score: number | null;
  status: string;
  archived_at: string | null;
  contacts: ContactRow[];
}
