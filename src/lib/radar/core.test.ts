import assert from "node:assert/strict";
import { test } from "node:test";
import {
  autoSourceBudget,
  backoffMs,
  canonicalUrl,
  dedupeKey,
  dedupeSignals,
  eventScore,
  isBackedOff,
  matchesAny,
  nextRunAt,
  sourceIsDue,
  stripHtml,
} from "./core.ts";

test("dedupe key ignores tracking params, hash, www and trailing slash but keeps ids", () => {
  assert.equal(canonicalUrl("https://www.Example.com/a/b/?utm_source=1#x"), "example.com/a/b");
  assert.equal(dedupeKey({ source: "hn_intent", url: "https://news.ycombinator.com/item?id=1" }), "hn_intent|news.ycombinator.com/item?id=1");
  assert.notEqual(
    dedupeKey({ source: "hn_intent", url: "https://news.ycombinator.com/item?id=1" }),
    dedupeKey({ source: "hn_intent", url: "https://news.ycombinator.com/item?id=2" }),
  );
});

test("dedupeSignals keeps the first of repeated urls per source", () => {
  const out = dedupeSignals([
    { source: "bluesky" as const, url: "https://a.com/x?utm_source=1" },
    { source: "bluesky" as const, url: "https://a.com/x/" },
    { source: "github" as const, url: "https://a.com/x" },
  ]);
  assert.equal(out.length, 2);
});

test("backoff doubles and caps", () => {
  assert.equal(backoffMs(0), 0);
  assert.equal(backoffMs(1), 5 * 60_000);
  assert.equal(backoffMs(2), 10 * 60_000);
  assert.equal(backoffMs(20), 6 * 60 * 60_000);
});

test("isBackedOff and sourceIsDue", () => {
  const now = Date.parse("2026-01-01T12:00:00Z");
  assert.equal(isBackedOff("2026-01-01T12:05:00Z", now), true);
  assert.equal(isBackedOff("2026-01-01T11:00:00Z", now), false);
  assert.equal(isBackedOff(null, now), false);
  assert.equal(sourceIsDue(null, 60_000, now), true);
  assert.equal(sourceIsDue("2026-01-01T11:59:30Z", 60_000, now), false);
  assert.equal(sourceIsDue("2026-01-01T11:58:00Z", 60_000, now), true);
});

test("nextRunAt never schedules faster than 30 minutes", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");
  assert.equal(nextRunAt(5, now), "2026-01-01T00:30:00.000Z");
  assert.equal(nextRunAt(360, now), "2026-01-01T06:00:00.000Z");
});

test("eventScore favours fresh funding over stale news", () => {
  const now = Date.parse("2026-01-30T00:00:00Z");
  const fresh = eventScore("funding", "2026-01-29T00:00:00Z", now);
  const stale = eventScore("news", "2025-10-01T00:00:00Z", now);
  assert.ok(fresh > 85 && fresh <= 95, String(fresh));
  assert.ok(stale < fresh);
  assert.ok(eventScore("hiring", null, now) > 0);
});

test("auto-source budget never goes negative", () => {
  assert.equal(autoSourceBudget(2, 5), 3);
  assert.equal(autoSourceBudget(9, 5), 0);
});

test("matchesAny is case-insensitive and skips tiny phrases", () => {
  assert.equal(matchesAny("Looking for a Zapier alternative", ["zapier"]), "zapier");
  assert.equal(matchesAny("hello", ["x"]), null);
});

test("stripHtml decodes common entities", () => {
  assert.equal(stripHtml("<p>We&#x27;re hiring <b>SDRs</b> &amp; AEs</p>"), "We're hiring SDRs & AEs");
});
