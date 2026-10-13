import { createHmac, randomUUID } from "node:crypto";
import type { ContactStatus } from "./types";
import { resolveMx } from "node:dns/promises";
import { verifyEmailViaIcypeas, verifyEmailsBulk } from "./icypeas";

export interface VerificationResult { status: ContactStatus; checks: Record<string, unknown>; }

/** Only a confirmed mailbox is safe to send to. Everything else (risky, accept_all, invalid, unverified) is held back. */
export function isSendSafe(status: string | null | undefined): boolean {
  return status === "verified";
}

/** Free domain check before spending a verification: a domain with no mail server can never receive an email. */
export async function domainAcceptsMail(domain: string): Promise<boolean | null> {
  try {
    const records = await resolveMx(domain);
    return records.length > 0;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "ENOTFOUND" || code === "ENODATA") return false;
    return null; // DNS hiccup: no verdict, let the real check decide
  }
}

/**
 * Domain first (free), then Icypeas, whose answer is already paid for and reachable over plain HTTPS. The self-hosted
 * EMAIL_VERIFIER_URL service is only a second opinion when Icypeas is unconfigured or slow. If nothing can answer, the
 * result is "risky" with reason verifier_not_configured, which callers must treat as not safe to send.
 */
export async function verifyEmail(email: string): Promise<VerificationResult> {
  const domain = email.split("@")[1]?.trim().toLowerCase();
  if (!domain || !email.includes("@")) return { status: "invalid", checks: { reason: "malformed" } };
  if ((await domainAcceptsMail(domain)) === false) return { status: "invalid", checks: { reason: "domain_has_no_mail_server" } };

  const viaIcypeas = await verifyEmailViaIcypeas(email);
  if (viaIcypeas) return viaIcypeas;

  return verifyEmailSelfHosted(email);
}

async function verifyEmailSelfHosted(email: string): Promise<VerificationResult> {
  const endpoint = process.env.EMAIL_VERIFIER_URL?.replace(/\/$/, "");
  const secret = process.env.EMAIL_VERIFIER_SECRET;
  if (!endpoint || !secret) return { status: "risky", checks: { reason: "verifier_not_configured" } };
  try {
    const timestamp = Date.now().toString();
    const nonce = randomUUID();
    const body = JSON.stringify({ email });
    const signature = createHmac("sha256", secret).update(`${timestamp}.${nonce}.${body}`).digest("hex");
    const response = await fetch(`${endpoint}/verify`, { method: "POST", headers: { "content-type": "application/json", "x-apsurn-timestamp": timestamp, "x-apsurn-nonce": nonce, "x-apsurn-signature": signature }, body, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) return { status: "risky", checks: { reason: "verifier_not_configured" } };
    const result = await response.json() as VerificationResult;
    return { status: ["verified", "accept_all", "risky", "invalid"].includes(result.status) ? result.status : "risky", checks: result.checks ?? {} };
  } catch {
    // Unreachable verifier (not running, wrong host, network error) must not
    // silently zero out every lead — treat it the same as "not configured" so
    // callers fall back to soft-trusting the pattern-matched email.
    return { status: "risky", checks: { reason: "verifier_not_configured" } };
  }
}

export interface CandidateVerdict {
  email: string;
  status: string;
}

/**
 * Check a list of possible addresses for one person all at once (one bulk verification, not one after another) and
 * report each verdict, best-ranked verified address first. Domains with no mail server are skipped without spending
 * anything. Empty when nothing can be checked (no verifier configured).
 */
export async function verifyCandidates(emails: string[]): Promise<{ verified: string | null; verdicts: CandidateVerdict[] }> {
  const unique = [...new Set(emails.map((email) => email.trim().toLowerCase()).filter((email) => email.includes("@")))];
  if (unique.length === 0) return { verified: null, verdicts: [] };
  const domain = unique[0].split("@")[1];
  if ((await domainAcceptsMail(domain)) === false) return { verified: null, verdicts: unique.map((email) => ({ email, status: "invalid" })) };
  const results = await verifyEmailsBulk(unique);
  const verdicts = unique.map((email) => ({ email, status: results.get(email)?.status ?? "unanswered" }));
  const verified = verdicts.find((verdict) => verdict.status === "verified")?.email ?? null;
  return { verified, verdicts };
}
