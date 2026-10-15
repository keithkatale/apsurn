import { createHmac, timingSafeEqual } from "node:crypto";
import { appOrigin } from "./templates";

function secret(): string {
  const value = process.env.UNSUBSCRIBE_SECRET?.trim() || process.env.SUPPRESSION_HASH_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  if (!value) throw new Error("Set UNSUBSCRIBE_SECRET (or CRON_SECRET) so unsubscribe links can be signed.");
  return value;
}

export function unsubscribeToken(userId: string): string {
  return createHmac("sha256", secret()).update(`unsubscribe:${userId}`).digest("hex").slice(0, 32);
}

export function verifyUnsubscribeToken(userId: string, token: string): boolean {
  try {
    const expected = Buffer.from(unsubscribeToken(userId));
    const given = Buffer.from(token);
    return expected.length === given.length && timingSafeEqual(expected, given);
  } catch {
    return false;
  }
}

export function unsubscribeUrl(userId: string): string {
  return `${appOrigin()}/unsubscribe?u=${encodeURIComponent(userId)}&t=${unsubscribeToken(userId)}`;
}

/** The endpoint mail clients POST to for one-click unsubscribe (RFC 8058). */
export function unsubscribePostUrl(userId: string): string {
  return `${appOrigin()}/api/unsubscribe?u=${encodeURIComponent(userId)}&t=${unsubscribeToken(userId)}`;
}
