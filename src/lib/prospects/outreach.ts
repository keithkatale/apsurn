import type { SupabaseClient } from "@supabase/supabase-js";
import { updateContacts } from "@/lib/prospecting/mutations";

export const OUTREACH_OPTIONS = [
  { id: "contacted", label: "Contacted" },
  { id: "not_contacted", label: "Not contacted" },
] as const;

export type OutreachState = (typeof OUTREACH_OPTIONS)[number]["id"];

export interface EnrollmentSnapshot {
  status: string;
  current_step: number;
}

/** One label for the column (campaign enrollment no longer applies). */
export function describeOutreach(leadStatus: string, _enrollments: EnrollmentSnapshot[] = []): {
  outreach: OutreachState;
  inCampaign: boolean;
  contacted: boolean;
} {
  const contacted =
    leadStatus === "contacted" ||
    leadStatus === "replied" ||
    leadStatus === "won";
  return {
    outreach: contacted ? "contacted" : "not_contacted",
    inCampaign: false,
    contacted,
  };
}

export async function setOutreach(
  db: SupabaseClient,
  userId: string,
  contactIds: string[],
  outreach: OutreachState,
): Promise<{ updated: number; error?: string }> {
  if (outreach === "contacted") {
    const result = await updateContacts(db, userId, contactIds, { leadStatus: "contacted" });
    return { updated: result.updated };
  }

  const result = await updateContacts(db, userId, contactIds, { leadStatus: "qualified" });
  return { updated: result.updated };
}
