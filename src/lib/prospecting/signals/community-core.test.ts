import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRelevancePrompt, candidateFromLaunch, dedupeLaunches, launchHeadline, matchesKeywords, parseRelevance } from "./community-core.ts";
import type { CommunityLaunch } from "../sources/community.ts";

const launch = (over: Partial<CommunityLaunch> = {}): CommunityLaunch => ({
  name: "Maritime",
  domain: "maritime.sh",
  tagline: "Run millions of agents, each on its own isolated VM.",
  sourceUrl: "https://www.ycombinator.com/launches/x",
  date: "2026-10-09T19:00:00.000Z",
  source: "yc_launches",
  tags: ["Developer Tools"],
  batch: "Fall 2026",
  strength: 0.7,
  ...over,
});

test("the relevance prompt carries what we sell and each company's own words", () => {
  const prompt = buildRelevancePrompt(
    [{ idx: 1, name: "Maritime", domain: "maritime.sh", tagline: "Run agents", source: "yc_launches", tags: ["Developer Tools"] }],
    { productSummary: "Outbound for B2B SaaS startups", keywords: ["AI agents"] },
  );
  assert.match(prompt, /Outbound for B2B SaaS startups/);
  assert.match(prompt, /1\. Maritime \(maritime\.sh\) via Launch YC/);
  assert.match(prompt, /AI agents/);
  assert.match(prompt, /never invent/i);
});

test("verdict parsing keeps only valid indexes and tolerates code fences", () => {
  const map = parseRelevance('```json\n{"keep":[{"idx":1,"why":"New product needing first customers"},{"idx":9,"why":"x"},{"idx":2}]}\n```', [1, 2, 3]);
  assert.equal(map?.size, 2);
  assert.equal(map?.get(1), "New product needing first customers");
  assert.equal(map?.get(2), "");
  assert.equal(parseRelevance("not json", [1]), null);
  assert.equal(parseRelevance('{"nope":1}', [1]), null);
});

test("headlines name the source and fold in the reason", () => {
  assert.equal(launchHeadline(launch(), "needs its first customers"), "Launched on Launch YC (Fall 2026): needs its first customers");
  assert.equal(launchHeadline(launch({ source: "yc_batch", batch: "Fall 2026" }), ""), "Joined Y Combinator Fall 2026");
  assert.equal(launchHeadline(launch({ source: "product_hunt" }), "x"), "Launched on Product Hunt: x");
});

test("a launch becomes a dated, sourced signal candidate", () => {
  const candidate = candidateFromLaunch(launch(), "why", "launch");
  assert.equal(candidate.triggerType, "launch");
  assert.equal(candidate.domain, "maritime.sh");
  assert.equal(candidate.sourceUrl, "https://www.ycombinator.com/launches/x");
  assert.equal(candidate.eventDate, "2026-10-09T19:00:00.000Z");
  assert.equal(candidate.excerpt, "Run millions of agents, each on its own isolated VM.");
});

test("dedupe keeps the strongest entry per domain and drops known domains", () => {
  const out = dedupeLaunches(
    [launch({ strength: 0.5, source: "betalist" }), launch({ strength: 0.9 }), launch({ domain: "other.com", name: "Other" }), launch({ domain: "known.com" })],
    new Set(["known.com"]),
  );
  assert.deepEqual(out.map((l) => l.domain).sort(), ["maritime.sh", "other.com"]);
  assert.equal(out.find((l) => l.domain === "maritime.sh")?.strength, 0.9);
});

test("keyword filter checks name, tagline and tags", () => {
  assert.equal(matchesKeywords(launch(), ["agents"]), true);
  assert.equal(matchesKeywords(launch(), ["fintech"]), false);
  assert.equal(matchesKeywords(launch(), []), true);
  assert.equal(matchesKeywords(launch(), ["developer tools"]), true);
});
