import { createHmac, randomUUID } from "node:crypto";
import type { ContactStatus } from "./types";

export interface VerificationResult { status: ContactStatus; checks: Record<string, unknown>; }

export async function verifyEmail(email: string): Promise<VerificationResult> {
  const endpoint = process.env.EMAIL_VERIFIER_URL?.replace(/\/$/, "");
  const secret = process.env.EMAIL_VERIFIER_SECRET;
  if (!endpoint || !secret) return { status: "risky", checks: { reason: "verifier_not_configured" } };
  const timestamp = Date.now().toString();
  const nonce = randomUUID();
  const body = JSON.stringify({ email });
  const signature = createHmac("sha256", secret).update(`${timestamp}.${nonce}.${body}`).digest("hex");
  const response = await fetch(`${endpoint}/verify`, { method: "POST", headers: { "content-type": "application/json", "x-apsurn-timestamp": timestamp, "x-apsurn-nonce": nonce, "x-apsurn-signature": signature }, body, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) return { status: "risky", checks: { reason: `verifier_${response.status}` } };
  const result = await response.json() as VerificationResult;
  return { status: ["verified", "accept_all", "risky", "invalid"].includes(result.status) ? result.status : "risky", checks: result.checks ?? {} };
}
