import test from "node:test";
import assert from "node:assert/strict";
import { emailCandidates, inferEmail, learnEmailPattern } from "./email-pattern.ts";
import type { ExtractedPerson } from "./types.ts";

function person(fullName: string, email: string | null): ExtractedPerson {
  return { fullName, normalizedName: fullName.toLowerCase(), title: null, location: null, sourceUrl: "https://acme.com/team", email, phone: null, profileUrl: null, evidence: { url: "https://acme.com/team", excerpt: fullName, observedAt: "2026-01-01T00:00:00Z" } };
}

test("requires two matching observed addresses before inference", () => {
  assert.equal(learnEmailPattern([person("Jane Doe", "jane.doe@acme.com")], "acme.com"), null);
  const pattern = learnEmailPattern([person("Jane Doe", "jane.doe@acme.com"), person("John Smith", "john.smith@acme.com")], "acme.com");
  assert.equal(pattern, "first.last");
  assert.equal(inferEmail("Mary Jones", "acme.com", pattern), "mary.jones@acme.com");
});

test("does not learn from another domain", () => {
  assert.equal(learnEmailPattern([person("Jane Doe", "jane.doe@other.com"), person("John Smith", "john.smith@other.com")], "acme.com"), null);
});

test("generates common candidates when no company pattern is known", () => {
  assert.deepEqual(emailCandidates("Mary Jones", "acme.com", null), [
    "mary.jones@acme.com",
    "mary@acme.com",
    "mjones@acme.com",
    "maryjones@acme.com",
    "m.jones@acme.com",
    "jones@acme.com",
  ]);
});
