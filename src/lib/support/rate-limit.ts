import { rateLimit } from "@/lib/rate-limit";

/** Public support endpoint: 20 messages per 10 minutes per address, so it can't be used as a free AI proxy. */
export function allowSupportRequest(key: string, now = Date.now()): boolean {
  return rateLimit(`support:${key}`, 20, 10 * 60 * 1000, now);
}
