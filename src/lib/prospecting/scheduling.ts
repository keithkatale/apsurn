import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Weekly prospecting schedule next-run computation + due-schedule claiming.
 * Ported (weekly-only) from /Users/KeithKatale/Documents/Agent's
 * packages/agent-core/src/scheduling/{next-run,store}.ts.
 */

export interface ProspectingSchedule {
  id: string;
  user_id: string;
  company_id: string;
  weekly_target: number;
  time_of_day: string;
  weekday: number;
  timezone: string;
  is_active: boolean;
  next_run_at: string;
  last_run_at: string | null;
  criteria: Record<string, unknown>;
}

type ZoneParts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

function partsInZone(date: Date, timeZone: string): ZoneParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const parts = dtf.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: weekdayMap[get("weekday")] ?? 0,
  };
}

function wallTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 3; i++) {
    const asLocal = partsInZone(new Date(utc), timeZone);
    const asUtcMs = Date.UTC(asLocal.year, asLocal.month - 1, asLocal.day, asLocal.hour, asLocal.minute, 0);
    const wanted = Date.UTC(year, month - 1, day, hour, minute, 0);
    const delta = wanted - asUtcMs;
    if (delta === 0) break;
    utc += delta;
  }
  return new Date(utc);
}

function addCalendarDaysInZone(date: Date, timeZone: string, days: number): Date {
  const p = partsInZone(date, timeZone);
  const noon = wallTimeToUtc(p.year, p.month, p.day, 12, 0, timeZone);
  return new Date(noon.getTime() + days * 24 * 60 * 60 * 1000);
}

/** Next UTC Date for a weekly schedule (weekday 0=Sun..6=Sat) expressed in `timezone`. */
export function computeNextWeeklyRun(
  timeOfDay: string,
  timezone: string,
  weekday: number,
  from: Date = new Date()
): Date {
  const [hhRaw, mmRaw] = timeOfDay.split(":");
  const hour = Number(hhRaw);
  const minute = Number(mmRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Invalid time_of_day: ${timeOfDay}`);
  }
  const tz = timezone || "UTC";
  for (let i = 0; i < 14; i++) {
    const day = addCalendarDaysInZone(from, tz, i);
    const p = partsInZone(day, tz);
    if (p.weekday !== weekday) continue;
    const candidate = wallTimeToUtc(p.year, p.month, p.day, hour, minute, tz);
    if (candidate.getTime() > from.getTime()) return candidate;
  }
  throw new Error("Could not compute weekly next run");
}

/**
 * Atomically claim due, active schedules and advance next_run_at by one week
 * (timezone-aware). Optimistic lock on next_run_at prevents double-firing.
 */
export async function claimDueSchedules(db: SupabaseClient = createAdminClient(), limit = 10): Promise<ProspectingSchedule[]> {
  const now = new Date();
  const { data: due, error } = await db
    .from("prospecting_schedules")
    .select("*")
    .eq("is_active", true)
    .lte("next_run_at", now.toISOString())
    .order("next_run_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  if (!due?.length) return [];

  const claimed: ProspectingSchedule[] = [];
  for (const row of due as ProspectingSchedule[]) {
    const next = computeNextWeeklyRun(row.time_of_day, row.timezone, row.weekday, now);
    const { data: updated, error: updErr } = await db
      .from("prospecting_schedules")
      .update({ last_run_at: now.toISOString(), next_run_at: next.toISOString(), updated_at: now.toISOString() })
      .eq("id", row.id)
      .eq("next_run_at", row.next_run_at)
      .eq("is_active", true)
      .select()
      .maybeSingle();
    if (updErr) {
      console.warn("[prospecting-schedule] claim update failed", row.id, updErr.message);
      continue;
    }
    if (!updated) continue; // lost the race to another worker
    claimed.push(row);
  }
  return claimed;
}
