import test from "node:test";
import assert from "node:assert/strict";
import { hiringCandidateFromRoles } from "./hiring-core.ts";
import type { AtsRole } from "../sources/ats.ts";

const seed = { name: "Acme", industry: "Software", location: "US", size: 40 };

const hire = (roles: AtsRole[], recencyDays = 30) => hiringCandidateFromRoles(roles, "Acme Inc", "acme.com", recencyDays, seed);

const role = (title: string, ageDays: number | null): AtsRole => ({
  title,
  location: null,
  url: `https://boards.greenhouse.io/acme/jobs/${encodeURIComponent(title)}`,
  publishedAt: ageDays === null ? null : new Date(Date.now() - ageDays * 86_400_000).toISOString(),
  ageDays,
});

test("keeps only roles inside the recency window and names the newest", () => {
  const candidate = hire([role("Senior SDR", 9), role("SDR Manager", 90), role("Account Executive", 3)]);
  assert.ok(candidate);
  assert.match(candidate.headline, /Hiring 2 roles incl\. Account Executive \(posted 3d ago\)/);
  assert.equal(candidate.sourceUrl?.includes("Account%20Executive"), true);
  assert.equal(candidate.companyName, "Acme Inc");
});

test("returns null when every matching role is stale or nothing matches", () => {
  assert.equal(hire([role("SDR", 120)]), null);
  assert.equal(hire([]), null);
});

test("an undated role counts but ranks behind dated ones, and more roles mean a stronger signal", () => {
  const one = hire([role("SDR", 5)]);
  const many = hire([role("SDR", 5), role("BDR", null), role("SDR II", 8)]);
  assert.ok(one && many);
  assert.ok(many.strength > one.strength);
  assert.match(many.headline, /posted 5d ago/);
});
