/**
 * The pre-send email gate. Addresses discovered earlier carry whatever confidence they had at the time, and
 * mailboxes go stale, so nothing is mailed unless it is confirmed as a real mailbox right before the first send.
 *
 * This does NOT address "Message blocked" bounces: those are sender reputation/deliverability (SPF/DKIM/DMARC,
 * warm-up, content), a different problem from address validity.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSendSafe, verifyEmail } from "@/lib/prospecting/email-verifier";

/**
 * ok: confirmed mailbox, safe to send.
 * invalid: the mailbox does not exist or could not be confirmed. Never send.
 * unverified: nothing could answer right now (verifier down or slow). Do not send yet; try again later.
 */
export type EmailCheckResult = { ok: true } | { ok: false; status: "invalid" | "unverified" };

/**
 * Last gate before any send: only an address confirmed as a real mailbox goes out. A contact already marked
 * "verified" is trusted; anything else (including catch-all and pattern guesses) is re-checked now, and a failed or
 * unanswered check blocks the send. This protects sender reputation: a bounce costs more than a skipped lead.
 */
export async function ensureSendableEmail(
  db: SupabaseClient,
  contactId: string,
  email: string,
  currentStatus: string | null
): Promise<EmailCheckResult> {
  if (isSendSafe(currentStatus)) return { ok: true };

  const result = await verifyEmail(email);
  if (result.checks?.reason === "verifier_not_configured") return { ok: false, status: "unverified" };
  await db.from("contacts").update({ email_status: result.status }).eq("id", contactId);
  if (isSendSafe(result.status)) return { ok: true };
  return { ok: false, status: "invalid" };
}
