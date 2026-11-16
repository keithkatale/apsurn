import assert from "node:assert/strict";
import test from "node:test";
import { heuristicQualify, MIN_QUALIFY_SCORE } from "./qualify-core.ts";

test("heuristicQualify keeps a public tool ask", () => {
  const verdict = heuristicQualify("Anyone looking for a tool to track invoices without a spreadsheet?");
  assert.equal(verdict.reject, false);
  assert.equal(verdict.intent, "tool_recommendation");
  assert.ok(verdict.score >= MIN_QUALIFY_SCORE);
});

test("heuristicQualify flags competitor switching", () => {
  const verdict = heuristicQualify("The Salesforce alternative we tried is too expensive and we want to switch", ["Salesforce"]);
  assert.equal(verdict.intent, "competitor_churn");
  assert.equal(verdict.reject, false);
});

test("heuristicQualify drops job seekers and vendors", () => {
  assert.equal(heuristicQualify("Open to work, looking for a role in sales").reject, true);
  assert.equal(heuristicQualify("Check out our platform and book a demo").reject, true);
});

test("heuristicQualify drops posts with no buying intent", () => {
  const verdict = heuristicQualify("Nice weather on the hike today");
  assert.equal(verdict.reject, true);
  assert.ok(verdict.score < MIN_QUALIFY_SCORE);
});
