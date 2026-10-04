/**
 * A just-in-time re-check of a contact's email right before the first send
 * of a sequence. Addresses discovered during prospecting carry whatever
 * confidence resolveEmail had at the time (often "risky" — a pattern guess
 * that passed MX but was never RCPT-checked, or "unverified"); mailboxes
 * also go stale between discovery and send. Sending straight to those is
 * what produced DSNs like "Address not found" in bulk. "verified"/
 * "accept_all" contacts are trusted as-is to avoid hammering the verifier
 * on every send.
 *
 * This does NOT address "Message blocked" bounces — those are sender
 * reputation/deliverability (SPF/DKIM/DMARC, warm-up, content), a different
 * problem from address validity, and out of scope here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyEmail } from "@/lib/prospecting/email-verifier";

const TRUSTED_STATUSES = new Set(["verified", "accept_all"]);

export type EmailCheckResult = { ok: true } | { ok: false; status: "invalid" };

export async function ensureSendableEmail(
  db: SupabaseClient,
  contactId: string,
  email: string,
  currentStatus: string | null
): Promise<EmailCheckResult> {
  if (currentStatus && TRUSTED_STATUSES.has(currentStatus)) return { ok: true };

  const result = await verifyEmail(email);
  await db.from("contacts").update({ email_status: result.status }).eq("id", contactId);
  if (result.status === "invalid") return { ok: false, status: "invalid" };
  return { ok: true };
}
