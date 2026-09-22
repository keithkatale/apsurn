import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 20;
const DEFAULT_DAILY_CAP = 40;

function envFlag(name: string, defaultOn = true): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  if (v === undefined || v === "") return defaultOn;
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function operatorTimezone(): string {
  return process.env.OUTREACH_TIMEZONE?.trim() || "America/New_York";
}

function windowHours(): { start: number; end: number } {
  const start = Number(process.env.OUTREACH_WINDOW_START_HOUR ?? DEFAULT_START_HOUR);
  const end = Number(process.env.OUTREACH_WINDOW_END_HOUR ?? DEFAULT_END_HOUR);
  return {
    start: Number.isFinite(start) ? start : DEFAULT_START_HOUR,
    end: Number.isFinite(end) ? end : DEFAULT_END_HOUR,
  };
}

export function dailySendCap(): number {
  const n = Number(process.env.OUTREACH_DAILY_CAP ?? DEFAULT_DAILY_CAP);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_DAILY_CAP;
}

/** Mon–Fri 08:00–20:00 operator-local by default (OpenOutSend sending_window). */
export function withinSendingWindow(now = new Date()): boolean {
  const tz = operatorTimezone();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const { start, end } = windowHours();

  const weekendOk = !envFlag("OUTREACH_ENFORCE_WEEKEND_PAUSE", true);
  const isWeekend = weekday === "Sat" || weekday === "Sun";
  if (!weekendOk && isWeekend) return false;

  const hoursOk = !envFlag("OUTREACH_ENFORCE_WORK_HOURS", true);
  if (hoursOk) return true;
  return hour >= start && hour < end;
}

function valueHash(kind: string, value: string) {
  const pepper = process.env.SUPPRESSION_HASH_SECRET?.trim();
  if (!pepper) return null;
  return createHash("sha256").update(`${pepper}:${kind}:${value.toLowerCase()}`).digest("hex");
}

export async function isEmailSuppressed(email: string): Promise<boolean> {
  const hash = valueHash("email", email);
  if (!hash) return false;
  const db = createAdminClient();
  const { data } = await db
    .from("suppressed_contact_values")
    .select("id")
    .eq("value_hash", hash)
    .maybeSingle();
  return Boolean(data);
}

/** Count sends from this inbox since UTC midnight. */
export async function inboxSendsToday(inboxId: string): Promise<number> {
  const db = createAdminClient();
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);

  const { data: sequences } = await db
    .from("sequences")
    .select("id")
    .eq("from_inbox_id", inboxId);
  const sequenceIds = (sequences ?? []).map((s) => s.id);
  if (sequenceIds.length === 0) return 0;

  const { data: enrollments } = await db
    .from("enrollments")
    .select("id")
    .in("sequence_id", sequenceIds);
  const enrollmentIds = (enrollments ?? []).map((e) => e.id);
  if (enrollmentIds.length === 0) return 0;

  const { count } = await db
    .from("email_sends")
    .select("id", { count: "exact", head: true })
    .eq("status", "sent")
    .gte("sent_at", start.toISOString())
    .in("enrollment_id", enrollmentIds);

  return count ?? 0;
}

export type GuardBlockReason =
  | "outside_window"
  | "suppressed"
  | "daily_cap"
  | "no_inbox"
  | "no_email"
  | null;

export async function checkSendGuards(opts: {
  email: string | null | undefined;
  inboxId: string | null | undefined;
  ignoreWindow?: boolean;
}): Promise<{ ok: true } | { ok: false; reason: Exclude<GuardBlockReason, null> }> {
  if (!opts.email) return { ok: false, reason: "no_email" };
  if (!opts.inboxId) return { ok: false, reason: "no_inbox" };
  if (!opts.ignoreWindow && !withinSendingWindow()) return { ok: false, reason: "outside_window" };
  if (await isEmailSuppressed(opts.email)) return { ok: false, reason: "suppressed" };
  const sent = await inboxSendsToday(opts.inboxId);
  if (sent >= dailySendCap()) return { ok: false, reason: "daily_cap" };
  return { ok: true };
}
