/**
 * Turns raw product events into the numbers on the admin pages. Pure, with no `@/` imports, so it runs under
 * `node --experimental-strip-types` (see analytics-core.test.ts).
 */

export interface EventRow {
  created_at: string;
  visitor_id: string;
  session_id: string;
  user_id: string | null;
  event: string;
  path: string;
  referrer_host: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  device: string | null;
  country: string | null;
}

export interface Counted {
  label: string;
  count: number;
}

export interface DayPoint {
  day: string;
  visitors: number;
  sessions: number;
  pageviews: number;
}

export interface Overview {
  visitors: number;
  sessions: number;
  pageviews: number;
  /** Visitors seen before this period, or on more than one day inside it. */
  returningVisitors: number;
  newVisitors: number;
  /** Sessions that are not their visitor's first ever. */
  repeatSessions: number;
  signedInVisitors: number;
  avgPagesPerSession: number;
  sources: Counted[];
  pages: Counted[];
  sections: Counted[];
  devices: Counted[];
  countries: Counted[];
  daily: DayPoint[];
}

const DAY_MS = 86_400_000;

export function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

function tally(values: Array<string | null | undefined>, limit: number, fallback = "Unknown"): Counted[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = (value ?? "").trim() || fallback;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

/** Where a session came from: a UTM source if it has one, else the referring site, else direct. */
export function sourceOf(row: Pick<EventRow, "utm_source" | "referrer_host">): string {
  const utm = row.utm_source?.trim().toLowerCase();
  if (utm) return utm;
  const host = row.referrer_host?.trim().toLowerCase().replace(/^www\./, "");
  return host || "Direct";
}

/** "/dashboard/campaigns/123" → "Campaigns"; everything outside the dashboard keeps its first segment. */
export function sectionOf(path: string): string {
  const clean = path.split("?")[0].split("#")[0];
  const parts = clean.split("/").filter(Boolean);
  if (parts.length === 0) return "Landing page";
  if (parts[0] === "dashboard") {
    const section = parts[1] ?? "home";
    return section.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
  }
  const first = parts[0].replace(/-/g, " ");
  return first.replace(/^./, (c) => c.toUpperCase());
}

/**
 * `rows` must include history before `sinceIso` so "returning" can be told apart from "new".
 * Everything is counted for events at or after `sinceIso`.
 */
export function summarize(rows: EventRow[], sinceIso: string): Overview {
  const firstSeen = new Map<string, string>();
  const firstSession = new Map<string, string>();
  for (const row of rows) {
    const seen = firstSeen.get(row.visitor_id);
    if (!seen || row.created_at < seen) {
      firstSeen.set(row.visitor_id, row.created_at);
      firstSession.set(row.visitor_id, row.session_id);
    }
  }

  const inRange = rows.filter((row) => row.created_at >= sinceIso);
  const visitors = new Set<string>();
  const sessions = new Set<string>();
  const daysByVisitor = new Map<string, Set<string>>();
  const sessionFirstRow = new Map<string, EventRow>();
  const pageviews = inRange.filter((row) => row.event === "pageview");
  const signedIn = new Set<string>();
  const perDay = new Map<string, { visitors: Set<string>; sessions: Set<string>; pageviews: number }>();

  for (const row of inRange) {
    visitors.add(row.visitor_id);
    sessions.add(row.session_id);
    if (row.user_id) signedIn.add(row.visitor_id);
    const days = daysByVisitor.get(row.visitor_id) ?? new Set<string>();
    days.add(dayOf(row.created_at));
    daysByVisitor.set(row.visitor_id, days);
    const first = sessionFirstRow.get(row.session_id);
    if (!first || row.created_at < first.created_at) sessionFirstRow.set(row.session_id, row);
    const day = dayOf(row.created_at);
    const bucket = perDay.get(day) ?? { visitors: new Set<string>(), sessions: new Set<string>(), pageviews: 0 };
    bucket.visitors.add(row.visitor_id);
    bucket.sessions.add(row.session_id);
    if (row.event === "pageview") bucket.pageviews += 1;
    perDay.set(day, bucket);
  }

  let returning = 0;
  for (const id of visitors) {
    const first = firstSeen.get(id) ?? sinceIso;
    if (first < sinceIso || (daysByVisitor.get(id)?.size ?? 0) > 1) returning += 1;
  }

  let repeatSessions = 0;
  for (const sessionId of sessions) {
    const row = sessionFirstRow.get(sessionId);
    if (row && firstSession.get(row.visitor_id) !== sessionId) repeatSessions += 1;
  }

  const sources = tally([...sessionFirstRow.values()].map(sourceOf), 10, "Direct");
  const daily = [...perDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, b]) => ({ day, visitors: b.visitors.size, sessions: b.sessions.size, pageviews: b.pageviews }));

  return {
    visitors: visitors.size,
    sessions: sessions.size,
    pageviews: pageviews.length,
    returningVisitors: returning,
    newVisitors: visitors.size - returning,
    repeatSessions,
    signedInVisitors: signedIn.size,
    avgPagesPerSession: sessions.size ? Math.round((pageviews.length / sessions.size) * 10) / 10 : 0,
    sources,
    pages: tally(pageviews.map((r) => r.path.split("?")[0]), 10),
    sections: tally(pageviews.map((r) => sectionOf(r.path)), 10),
    devices: tally([...sessionFirstRow.values()].map((r) => r.device), 5),
    countries: tally([...sessionFirstRow.values()].map((r) => r.country), 10),
    daily,
  };
}

export interface SessionSummary {
  sessionId: string;
  startedAt: string;
  minutes: number;
  pages: number;
  source: string;
  sections: string[];
}

export interface Profile {
  firstSeen: string | null;
  lastSeen: string | null;
  sessions: number;
  activeDays: number;
  pageviews: number;
  /** Average days between two days the person was active. Null with fewer than two active days. */
  avgDaysBetweenVisits: number | null;
  /** Days since they were last seen, relative to `nowIso`. */
  daysSinceLastSeen: number | null;
  sections: Counted[];
  recentSessions: SessionSummary[];
}

/** One person's activity: how often they come back and what they use. `rows` are all their events. */
export function profileOf(rows: EventRow[], nowIso: string): Profile {
  if (rows.length === 0) {
    return { firstSeen: null, lastSeen: null, sessions: 0, activeDays: 0, pageviews: 0, avgDaysBetweenVisits: null, daysSinceLastSeen: null, sections: [], recentSessions: [] };
  }
  const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const days = [...new Set(sorted.map((r) => dayOf(r.created_at)))].sort();
  let avgGap: number | null = null;
  if (days.length > 1) {
    const span = (Date.parse(days[days.length - 1]) - Date.parse(days[0])) / DAY_MS;
    avgGap = Math.round((span / (days.length - 1)) * 10) / 10;
  }

  const bySession = new Map<string, EventRow[]>();
  for (const row of sorted) {
    const list = bySession.get(row.session_id) ?? [];
    list.push(row);
    bySession.set(row.session_id, list);
  }
  const recentSessions: SessionSummary[] = [...bySession.entries()]
    .map(([sessionId, events]) => {
      const start = events[0].created_at;
      const end = events[events.length - 1].created_at;
      const pages = events.filter((e) => e.event === "pageview");
      return {
        sessionId,
        startedAt: start,
        minutes: Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 60_000)),
        pages: pages.length,
        source: sourceOf(events[0]),
        sections: [...new Set(pages.map((e) => sectionOf(e.path)))],
      };
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 12);

  const last = sorted[sorted.length - 1].created_at;
  return {
    firstSeen: sorted[0].created_at,
    lastSeen: last,
    sessions: bySession.size,
    activeDays: days.length,
    pageviews: sorted.filter((r) => r.event === "pageview").length,
    avgDaysBetweenVisits: avgGap,
    daysSinceLastSeen: Math.max(0, Math.floor((Date.parse(nowIso) - Date.parse(last)) / DAY_MS)),
    sections: tally(sorted.filter((r) => r.event === "pageview").map((r) => sectionOf(r.path)), 8),
    recentSessions,
  };
}
