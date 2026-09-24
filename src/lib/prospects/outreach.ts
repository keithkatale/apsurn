import type { SupabaseClient } from "@supabase/supabase-js";
import { enrollContacts } from "@/lib/sequences/mutations";
import { updateContacts } from "@/lib/prospecting/mutations";

export const OUTREACH_OPTIONS = [
  { id: "in_campaign", label: "In campaign" },
  { id: "not_in_campaign", label: "Not in campaign" },
  { id: "contacted", label: "Contacted" },
  { id: "not_contacted", label: "Not contacted" },
] as const;

export type OutreachState = (typeof OUTREACH_OPTIONS)[number]["id"];

export interface EnrollmentSnapshot {
  status: string;
  current_step: number;
}

/** One label for the column, plus the two facts the table tabs filter on. */
export function describeOutreach(leadStatus: string, enrollments: EnrollmentSnapshot[]): {
  outreach: OutreachState;
  inCampaign: boolean;
  contacted: boolean;
} {
  const contacted =
    leadStatus === "contacted" ||
    leadStatus === "replied" ||
    leadStatus === "won" ||
    enrollments.some((row) => row.current_step > 0 || row.status === "completed" || row.status === "replied");
  const inCampaign = enrollments.some((row) => row.status === "active" || row.status === "completed" || row.status === "replied");
  const outreach: OutreachState = contacted ? "contacted" : inCampaign ? "in_campaign" : "not_contacted";
  return { outreach, inCampaign, contacted };
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

  if (outreach === "not_contacted") {
    const result = await updateContacts(db, userId, contactIds, { leadStatus: "qualified" });
    return { updated: result.updated };
  }

  if (outreach === "not_in_campaign") {
    const { data: owned } = await db
      .from("contacts")
      .select("id, prospect_companies!inner(user_id)")
      .in("id", contactIds)
      .eq("prospect_companies.user_id", userId);
    const ids = (owned ?? []).map((row) => row.id);
    if (ids.length === 0) return { updated: 0 };
    const { error } = await db
      .from("enrollments")
      .update({ status: "stopped", ended_at: new Date().toISOString() })
      .in("contact_id", ids)
      .eq("status", "active");
    if (error) return { updated: 0, error: error.message };
    return { updated: ids.length };
  }

  const { data: sequence } = await db
    .from("sequences")
    .select("id")
    .eq("user_id", userId)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sequence) return { updated: 0, error: "Create a campaign before marking a lead in campaign." };

  const enrolled = await enrollContacts(db, userId, sequence.id, contactIds);
  if (!enrolled.ok) return { updated: 0, error: enrolled.error };
  await db
    .from("enrollments")
    .update({ status: "active", ended_at: null, next_send_at: new Date().toISOString() })
    .eq("sequence_id", sequence.id)
    .in("contact_id", contactIds)
    .eq("status", "stopped");
  if (enrolled.data.enrolled === 0) {
    const { count } = await db
      .from("enrollments")
      .select("id", { count: "exact", head: true })
      .eq("sequence_id", sequence.id)
      .in("contact_id", contactIds)
      .eq("status", "active");
    if ((count ?? 0) === 0) {
      return { updated: 0, error: "Those leads need an email address before they can join a campaign." };
    }
  }
  return { updated: Math.max(enrolled.data.enrolled, contactIds.length) };
}
