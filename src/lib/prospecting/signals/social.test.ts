import test from "node:test";
import assert from "node:assert/strict";
import { buildPainPrompt, companyFromHeadline, engagementStrength, parsePainVerdicts } from "./social-core.ts";

test("pulls an employer only from an explicit 'at', '@' or 'of'", () => {
  assert.equal(companyFromHeadline("Co-founder at Acme Robotics | helping teams ship"), "Acme Robotics");
  assert.equal(companyFromHeadline("CEO @ Zephyr"), "Zephyr");
  assert.equal(companyFromHeadline("Head of Growth | Borealis Labs"), null);
  assert.equal(companyFromHeadline("Founder of Northwind. Building in public"), "Northwind");
});

test("marketing blurbs and non-employers yield nothing rather than a guess", () => {
  assert.equal(companyFromHeadline("SDR | B2B SaaS & Real Estate| Appointment Setter | I turn cold outreach into booked sales calls"), null);
  assert.equal(companyFromHeadline("Open at The Moment To New Opportunities"), null);
  assert.equal(companyFromHeadline("Helping founders at scale"), null);
  assert.equal(companyFromHeadline(null), null);
});

test("parses verdicts, normalises 'null' company strings, and rejects a reply that skips most posts", () => {
  const verdicts = parsePainVerdicts(
    'Here you go: {"verdicts":[{"i":1,"pain":true,"summary":"Cannot find qualified leads","company":"Acme"},{"i":2,"pain":false,"summary":"","company":"null"},{"i":9,"pain":true}]}',
    [1, 2],
  );
  assert.equal(verdicts?.get(1)?.pain, true);
  assert.equal(verdicts?.get(1)?.company, "Acme");
  assert.equal(verdicts?.get(2)?.company, null);
  assert.equal(verdicts?.has(9), false);
  assert.equal(parsePainVerdicts('{"verdicts":[{"i":1,"pain":true}]}', [1, 2, 3, 4]), null);
  assert.equal(parsePainVerdicts("no", [1]), null);
});

test("only a literal true counts as pain", () => {
  const verdicts = parsePainVerdicts('{"verdicts":[{"i":1,"pain":"true"},{"i":2,"pain":1}]}', [1, 2]);
  assert.equal(verdicts?.get(1)?.pain, false);
  assert.equal(verdicts?.get(2)?.pain, false);
});

test("the prompt tells the model to reject sellers and never guess a company", () => {
  const prompt = buildPainPrompt([{ idx: 1, author: "Jo", headline: "SDR", text: "We keep losing deals" }], "outbound sales automation");
  assert.match(prompt, /outbound sales automation/);
  assert.match(prompt, /Never guess/);
  assert.match(prompt, /sells in this space/);
});

test("engagement strength grows with reactions but stays within [0.3, 1]", () => {
  assert.ok(engagementStrength(0, 0) >= 0.3);
  assert.ok(engagementStrength(500, 40) > engagementStrength(5, 0));
  assert.ok(engagementStrength(1e9, 1e9) <= 1);
  assert.ok(engagementStrength(null, null) >= 0.3);
});
