import test from "node:test";
import assert from "node:assert/strict";
import { candidateTerms, roleKeywordsFor, toStateCode, translateGeoTokens, translateYcTerms } from "./vocabulary.ts";

// These three phrases are the ones that actually broke prospecting: the AI
// planner emits wording like this, and matched literally against YC's closed
// taxonomy each returned zero companies.
test("maps the ICP wording that previously matched nothing", () => {
  const sales = translateYcTerms(["Sales Technology SaaS"]);
  assert.ok(sales.tags.includes("Sales"), "should pick up the Sales tag");
  assert.ok(sales.subindustries.includes("B2B -> Sales"), "should pick up the sales subindustry");

  const fintech = translateYcTerms(["Financial Technology Software"]);
  assert.ok(fintech.industries.includes("Fintech"));

  const ai = translateYcTerms(["Artificial Intelligence Software"]);
  assert.ok(ai.tags.includes("Artificial Intelligence"));
});

test("every mapped term yields at least one predicate", () => {
  for (const phrase of ["B2B SaaS", "HR Technology SaaS", "Marketing Technology", "devtools", "cybersecurity", "proptech"]) {
    const result = translateYcTerms([phrase]);
    const predicates = result.industries.length + result.subindustries.length + result.tags.length;
    assert.ok(predicates > 0, `"${phrase}" produced no predicates`);
  }
});

test("unmapped wording degrades to a keyword rather than vanishing", () => {
  const result = translateYcTerms(["artisanal pickle fermentation"]);
  assert.equal(result.tags.length + result.industries.length + result.subindustries.length, 0);
  assert.deepEqual(result.keywords, ["artisanal pickle fermentation"]);
});

test("a generic motion term never dilutes a specific vertical", () => {
  // "software" on its own means B2B + SaaS — some 3,400 companies. OR'ing it
  // alongside "financial technology" would return every B2B company instead
  // of fintech ones, which is how a precise ICP became a useless filter.
  const fintech = translateYcTerms(["Financial Technology Software"]);
  assert.deepEqual(fintech.industries, ["Fintech"]);
  assert.ok(!fintech.tags.includes("SaaS"), "generic SaaS tag must be dropped");

  // But when the ICP really is just generic, the fallback still applies.
  const generic = translateYcTerms(["B2B SaaS"]);
  assert.ok(generic.tags.includes("SaaS") || generic.industries.includes("B2B"));
});

test("filler words inside a mapped term survive tokenisation", () => {
  // "technology" is a filler word, but "financial technology" is a real entry
  // — stripping fillers before building n-grams would lose the match.
  assert.ok(translateYcTerms(["Financial Technology Software"]).industries.includes("Fintech"));
  assert.ok(translateYcTerms(["Developer Tools"]).tags.includes("Developer Tools"));
});

test("geography phrases expand to real location tokens", () => {
  assert.deepEqual(translateGeoTokens(["North America"]), ["USA", "Canada", "Mexico"]);
  assert.deepEqual(translateGeoTokens(["United States"]), ["USA"]);
  // "global" maps to nothing on purpose: it means "do not filter".
  assert.deepEqual(translateGeoTokens(["Global"]), []);
});

test("unmapped geographies pass through as literal tokens", () => {
  // City names are already valid all_locations tokens, so they need no entry.
  assert.deepEqual(translateGeoTokens(["Berlin"]), ["Berlin"]);
});

test("geography mapping de-duplicates overlapping phrases", () => {
  assert.deepEqual(translateGeoTokens(["United States", "USA", "us"]), ["USA"]);
});

test("candidateTerms drops filler words and yields sub-phrases", () => {
  const terms = candidateTerms("Sales Technology Solutions");
  assert.ok(terms.includes("sales"), "should reduce to the meaningful word");
  assert.ok(!terms.includes("technology"), "a filler word alone is not a candidate");
});

test("state names and codes both resolve", () => {
  assert.equal(toStateCode("New York"), "NY");
  assert.equal(toStateCode("ny"), "NY");
  assert.equal(toStateCode("California"), "CA");
  assert.equal(toStateCode("Atlantis"), null);
});

test("personas become ATS title fragments, with a go-to-market default", () => {
  const sales = roleKeywordsFor(["VP of Sales"]);
  assert.ok(sales.includes("sales"));
  // No personas still has to produce a usable hiring signal.
  assert.ok(roleKeywordsFor([]).includes("sales"));
});
