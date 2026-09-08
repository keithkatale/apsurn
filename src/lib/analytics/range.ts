import { addHours, endOfDay, startOfDay, startOfHour, subDays } from "date-fns";
import type { AnalyticsRange } from "./types";

export function parseAnalyticsRange(raw: string | null): AnalyticsRange {
  if (raw === "24h" || raw === "7d" || raw === "30d" || raw === "90d") return raw;
  return "7d";
}

export function rangeWindow(range: AnalyticsRange) {
  const now = new Date();
  if (range === "24h") {
    return { start: startOfDay(now), end: endOfDay(now), interval: "hour" as const };
  }
  const days = range === "30d" ? 30 : range === "90d" ? 90 : 7;
  return { start: subDays(now, days), end: now, interval: "day" as const };
}

export function fillTimeline(
  counts: Map<string, number>,
  range: AnalyticsRange
): Array<{ date: string; visitors: number }> {
  const { start, interval } = rangeWindow(range);
  const result: Array<{ date: string; visitors: number }> = [];

  if (interval === "hour") {
    let current = startOfHour(start);
    const end = startOfHour(new Date());
    while (current <= end) {
      const key = current.toISOString();
      result.push({ date: key, visitors: counts.get(key) ?? 0 });
      current = addHours(current, 1);
    }
    return result;
  }

  let current = startOfDay(start);
  const end = startOfDay(new Date());
  while (current <= end) {
    const key = current.toISOString();
    result.push({ date: key, visitors: counts.get(key) ?? 0 });
    current = new Date(current.getTime() + 86400_000);
  }
  return result;
}

export function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes}m ${secs}s`;
}

export function countryFlag(countryCode: string) {
  if (!countryCode || countryCode === "Unknown" || countryCode.length !== 2) return "🌍";
  try {
    return String.fromCodePoint(
      ...countryCode.toUpperCase().split("").map((char) => 127397 + char.charCodeAt(0))
    );
  } catch {
    return "🌍";
  }
}
