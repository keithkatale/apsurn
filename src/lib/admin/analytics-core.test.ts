import test from "node:test";
import assert from "node:assert/strict";
import { profileOf, sectionOf, sourceOf, summarize, type EventRow } from "./analytics-core.ts";

function ev(over: Partial<EventRow> & Pick<EventRow, "created_at" | "visitor_id" | "session_id">): EventRow {
  return { user_id: null, event: "pageview", path: "/", referrer_host: null, utm_source: null, utm_medium: null, device: "desktop", country: "US", ...over };
}

test("sourceOf prefers utm, then the referring site, else Direct", () => {
  assert.equal(sourceOf({ utm_source: "Twitter", referrer_host: "t.co" }), "twitter");
  assert.equal(sourceOf({ utm_source: null, referrer_host: "www.google.com" }), "google.com");
  assert.equal(sourceOf({ utm_source: null, referrer_host: null }), "Direct");
});

test("sectionOf names the dashboard section a path belongs to", () => {
  assert.equal(sectionOf("/dashboard/campaigns/abc"), "Campaigns");
  assert.equal(sectionOf("/dashboard/market-insights"), "Market insights");
  assert.equal(sectionOf("/"), "Landing page");
  assert.equal(sectionOf("/setup?url=x"), "Setup");
});

test("summarize counts new vs returning visitors and repeat sessions", () => {
  const since = "2026-10-10T00:00:00.000Z";
  const rows = [
    ev({ created_at: "2026-10-01T10:00:00.000Z", visitor_id: "a", session_id: "a1" }), // seen before the period
    ev({ created_at: "2026-10-11T10:00:00.000Z", visitor_id: "a", session_id: "a2", referrer_host: "google.com" }),
    ev({ created_at: "2026-10-11T10:05:00.000Z", visitor_id: "a", session_id: "a2", path: "/dashboard/campaigns" }),
    ev({ created_at: "2026-10-11T12:00:00.000Z", visitor_id: "b", session_id: "b1", utm_source: "x" }),
    ev({ created_at: "2026-10-12T12:00:00.000Z", visitor_id: "b", session_id: "b2" }), // two days in the period
    ev({ created_at: "2026-10-12T13:00:00.000Z", visitor_id: "c", session_id: "c1", user_id: "u1" }),
  ];
  const o = summarize(rows, since);
  assert.equal(o.visitors, 3);
  assert.equal(o.sessions, 4);
  assert.equal(o.returningVisitors, 2); // a (older history) and b (two days)
  assert.equal(o.newVisitors, 1);
  assert.equal(o.repeatSessions, 2); // a2 and b2
  assert.equal(o.signedInVisitors, 1);
  assert.deepEqual(o.sources.find((s) => s.label === "google.com")?.count, 1);
  assert.equal(o.daily.length, 2);
});

test("profileOf measures how often a person comes back and what they use", () => {
  const rows = [
    ev({ created_at: "2026-10-01T10:00:00.000Z", visitor_id: "a", session_id: "s1", path: "/dashboard/campaigns" }),
    ev({ created_at: "2026-10-03T10:00:00.000Z", visitor_id: "a", session_id: "s2", path: "/dashboard/copilot" }),
    ev({ created_at: "2026-10-03T10:20:00.000Z", visitor_id: "a", session_id: "s2", path: "/dashboard/campaigns" }),
    ev({ created_at: "2026-10-07T10:00:00.000Z", visitor_id: "a", session_id: "s3", path: "/dashboard/campaigns" }),
  ];
  const p = profileOf(rows, "2026-10-09T10:00:00.000Z");
  assert.equal(p.sessions, 3);
  assert.equal(p.activeDays, 3);
  assert.equal(p.avgDaysBetweenVisits, 3);
  assert.equal(p.daysSinceLastSeen, 2);
  assert.equal(p.sections[0].label, "Campaigns");
  assert.equal(p.sections[0].count, 3);
  assert.equal(p.recentSessions[0].sessionId, "s3");
  assert.equal(p.recentSessions.find((s) => s.sessionId === "s2")?.minutes, 20);
});
