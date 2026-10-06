import test from "node:test";
import assert from "node:assert/strict";
import { eventKey, qualifyReasonFor, rankLeads, recencyFactor } from "./score.ts";
import type { SignalCandidate } from "./types.ts";

const NOW = Date.parse("2026-10-05T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

function signal(over: Partial<SignalCandidate>): SignalCandidate {
  return {
    companyName: "Acme",
    domain: "acme.com",
    triggerType: "hiring",
    headline: "Hiring 2 SDRs",
    sourceUrl: "https://boards.greenhouse.io/acme/jobs/1",
    excerpt: "SDR",
    eventDate: daysAgo(3),
    strength: 0.5,
    ...over,
  };
}

test("recency decays with age and treats undated signals as middling", () => {
  assert.ok(recencyFactor(daysAgo(0), 30, NOW) > recencyFactor(daysAgo(20), 30, NOW));
  assert.equal(recencyFactor(null, 30, NOW), 0.5);
  assert.equal(recencyFactor("not a date", 30, NOW), 0.5);
});

test("a company with two different triggers outranks one with a single stronger signal", () => {
  const leads = rankLeads(
    [
      signal({ domain: "solo.com", companyName: "Solo", triggerType: "funding_news", headline: "Raised $5M", eventDate: daysAgo(2), strength: 1 }),
      signal({ domain: "both.com", companyName: "Both", triggerType: "funding_news", headline: "Raised $3M", eventDate: daysAgo(4), strength: 0.8 }),
      signal({ domain: "both.com", companyName: "Both", triggerType: "hiring", headline: "Hiring 3 AEs", eventDate: daysAgo(1), strength: 0.8 }),
    ],
    { funding_news: 30, hiring: 30 },
    NOW,
  );
  assert.equal(leads[0].domain, "both.com");
  assert.equal(leads[0].signals.length, 2);
});

test("candidates without a domain never become leads", () => {
  assert.equal(rankLeads([signal({ domain: null })], {}, NOW).length, 0);
});

test("qualify reason lists the strongest signal of each type, at most two", () => {
  const reason = qualifyReasonFor([
    signal({ triggerType: "funding_news", headline: "Raised $12M Series A." }),
    signal({ triggerType: "funding_news", headline: "Raised a seed round" }),
    signal({ triggerType: "hiring", headline: "Hiring 3 SDRs (posted 9d ago)" }),
    signal({ triggerType: "tech_website", headline: "Uses Intercom" }),
  ]);
  assert.equal(reason, "Raised $12M Series A; Hiring 3 SDRs (posted 9d ago)");
});

test("event key ignores the moving 'posted N days ago' part so a rescan dedupes", () => {
  const a = eventKey(signal({ sourceUrl: null, headline: "Hiring 3 SDRs (posted 9d ago)" }));
  const b = eventKey(signal({ sourceUrl: null, headline: "Hiring 3 SDRs (posted 16d ago)" }));
  assert.equal(a, b);
});
