import assert from "node:assert/strict";
import test from "node:test";
import { parseListeningKeywords } from "./suggest-core.ts";

test("parseListeningKeywords reads phrase objects and tags intent", () => {
  const text = `Here you go {"keywords":[{"phrase":"alternative to Hubspot","intent":"competitor_churn"},{"phrase":"invoice tracking tool","intent":"tool_recommendation"}]}`;
  const keywords = parseListeningKeywords(text);
  assert.equal(keywords.length, 2);
  assert.deepEqual(keywords[0], { keyword: "alternative to Hubspot", intent: "competitor_churn" });
  assert.equal(keywords[1].intent, "tool_recommendation");
});

test("parseListeningKeywords accepts plain strings and drops junk", () => {
  const keywords = parseListeningKeywords(`{"keywords":["looking for a crm","ok","looking for a crm","${"x".repeat(90)}"]}`);
  assert.equal(keywords.length, 1);
  assert.equal(keywords[0].keyword, "looking for a crm");
  assert.equal(keywords[0].intent, "tool_recommendation");
});

test("parseListeningKeywords returns nothing for prose", () => {
  assert.deepEqual(parseListeningKeywords("no json here"), []);
});
