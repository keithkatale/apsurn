import test from "node:test";
import assert from "node:assert/strict";
import { isValidIcypeasIndustry, matchIcypeasIndustries } from "./icypeas-industries.ts";

// These are the exact ICP phrases that returned zero companies when sent to
// Icypeas literally: "SaaS" and "Computer Software" are not valid enum
// values, so a query built from them silently matched nobody.
test("maps the ICP wording that previously matched nothing", () => {
  for (const phrase of ["Sales Technology SaaS", "Marketing Technology SaaS", "HR Technology SaaS", "B2B SaaS"]) {
    const result = matchIcypeasIndustries([phrase]);
    assert.ok(result.length > 0, `"${phrase}" produced no industries`);
    for (const value of result) assert.ok(isValidIcypeasIndustry(value), `"${value}" is not a real enum value`);
  }
});

test("a bigram alias fires even when another word in the same phrase has its own alias", () => {
  const result = matchIcypeasIndustries(["Financial Technology Software"]);
  assert.ok(result.includes("Financial Services"), "fintech alias should fire");
  assert.ok(result.includes("Software Development"), "software alias should also fire");
});

test("every returned value is a real enum entry", () => {
  for (const phrase of ["dental practices", "trucking and logistics", "field service management software"]) {
    for (const value of matchIcypeasIndustries([phrase])) assert.ok(isValidIcypeasIndustry(value));
  }
});

test("unmatched gibberish returns an empty list rather than throwing", () => {
  assert.deepEqual(matchIcypeasIndustries(["zzz qqq xyzzy"]), []);
});

test("results are de-duplicated across multiple phrases", () => {
  const result = matchIcypeasIndustries(["SaaS", "Software"]);
  assert.equal(result.length, new Set(result).size);
});
