import type { SupabaseClient } from "@supabase/supabase-js";
import { domainAcceptsMail } from "@/lib/prospecting/email-verifier";
import { verifyEmailsBulk } from "@/lib/prospecting/icypeas";

export interface VerifyContactsSummary {
  checked: number;
  verified: number;
  invalid: number;
  risky: number;
  /** No answer in time (or no verifier configured): left as they were and still blocked from sending. */
  unanswered: number;
}

const PAGE = 1000;

/**
 * Confirm the mailbox behind every contact email that isn't already confirmed, and record the result in email_status.
 * Domains with no mail server are marked invalid for free; the rest go through Icypeas bulk verification. Only
 * "verified" contacts can be mailed (see ensureSendableEmail), so this is how an existing list becomes sendable.
 */
export async function verifyContacts(db: SupabaseClient, opts: { userId?: string; recheckAll?: boolean } = {}): Promise<VerifyContactsSummary> {
  const summary: VerifyContactsSummary = { checked: 0, verified: 0, invalid: 0, risky: 0, unanswered: 0 };

  const rows: Array<{ id: string; email: string }> = [];
  for (let from = 0; ; from += PAGE) {
    let query = db
      .from("contacts")
      .select("id, email, email_status, prospect_companies!contacts_prospect_company_id_fkey!inner(user_id)")
      .not("email", "is", null)
      .is("archived_at", null)
      .order("id")
      .range(from, from + PAGE - 1);
    if (opts.userId) query = query.eq("prospect_companies.user_id", opts.userId);
    if (!opts.recheckAll) query = query.neq("email_status", "verified");
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const email = String(row.email ?? "").trim().toLowerCase();
      if (email.includes("@")) rows.push({ id: row.id as string, email });
    }
    if (!data || data.length < PAGE) break;
  }
  if (rows.length === 0) return summary;

  const byStatus: Record<"verified" | "invalid" | "risky", string[]> = { verified: [], invalid: [], risky: [] };

  // Free pass first: a domain with no mail server can never receive anything.
  const domainOk = new Map<string, boolean | null>();
  const toVerify: Array<{ id: string; email: string }> = [];
  for (const row of rows) {
    const domain = row.email.split("@")[1];
    if (!domainOk.has(domain)) domainOk.set(domain, await domainAcceptsMail(domain));
    if (domainOk.get(domain) === false) byStatus.invalid.push(row.id);
    else toVerify.push(row);
  }

  const verdicts = await verifyEmailsBulk(toVerify.map((row) => row.email));
  for (const row of toVerify) {
    const verdict = verdicts.get(row.email);
    if (!verdict) {
      summary.unanswered += 1;
      continue;
    }
    byStatus[verdict.status === "verified" ? "verified" : verdict.status === "risky" ? "risky" : "invalid"].push(row.id);
  }

  for (const status of ["verified", "invalid", "risky"] as const) {
    const ids = byStatus[status];
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await db.from("contacts").update({ email_status: status }).in("id", ids.slice(i, i + 200));
      if (error) throw new Error(error.message);
    }
    summary[status] = ids.length;
  }
  summary.checked = rows.length - summary.unanswered;
  return summary;
}
