import type { NextRequest } from "next/server";

const buckets = new Map<string, number[]>();

/**
 * Small in-memory sliding-window limiter for public endpoints. It is per server instance, so it blunts abuse
 * rather than guaranteeing a global cap; put a shared store or an edge rule in front for hard limits.
 */
export function rateLimit(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  if (buckets.size > 10_000) {
    for (const [k, times] of buckets) if (times.every((t) => now - t >= windowMs)) buckets.delete(k);
  }
  return true;
}

export function clientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}
