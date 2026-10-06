import test from "node:test";
import assert from "node:assert/strict";
import { buildFitPrompt, locationFits, parseFitVerdicts } from "./fit-core.ts";

test("parses verdicts from fenced or chatty JSON and ignores unknown indices", () => {
  const fits = parseFitVerdicts('Sure!\n```json\n{"verdicts":[{"i":1,"fit":true},{"i":2,"fit":false},{"i":99,"fit":true}]}\n```', [1, 2]);
  assert.deepEqual([...(fits ?? [])], [1]);
});

test("a reply that skips most companies, or isn't JSON, is not a verdict", () => {
  assert.equal(parseFitVerdicts('{"verdicts":[{"i":1,"fit":true}]}', [1, 2, 3, 4]), null);
  assert.equal(parseFitVerdicts("no idea", [1]), null);
  assert.equal(parseFitVerdicts('{"verdicts":"yes"}', [1]), null);
});

test("treats a missing fit as not-fit rather than guessing", () => {
  const fits = parseFitVerdicts('{"verdicts":[{"i":1},{"i":2,"fit":"true"}]}', [1, 2]);
  assert.equal(fits?.size, 0);
});

test("the prompt lists every company and carries the ICP", () => {
  const prompt = buildFitPrompt([{ idx: 1, company: "Acme", domain: "acme.com", role: "SDR" }], { industries: ["Computer Software"], geographies: ["United States"] });
  assert.match(prompt, /1\. Acme \(acme\.com\) — hiring: SDR/);
  assert.match(prompt, /Computer Software/);
});

test("location: remote and unlocated pass, regions match, short codes need word boundaries", () => {
  const tokens = ["United States", "USA", "CA"];
  assert.equal(locationFits("Remote", tokens), true);
  assert.equal(locationFits("", tokens), true);
  assert.equal(locationFits("Austin, United States", tokens), true);
  assert.equal(locationFits("München, Germany", tokens), false);
  assert.equal(locationFits("Chicago", tokens), false);
  assert.equal(locationFits("San Francisco, CA", tokens), true);
  assert.equal(locationFits("Remote (Europe)", tokens), false);
  assert.equal(locationFits("Berlin", []), true);
});
