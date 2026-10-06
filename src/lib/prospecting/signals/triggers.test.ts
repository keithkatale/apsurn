import test from "node:test";
import assert from "node:assert/strict";
import { parseTriggers } from "./triggers.ts";

test("drops unknown types and duplicate types, defaults and clamps recency", () => {
  const specs = parseTriggers([
    { type: "hiring", roles: [" SDR ", "", 7], recencyDays: 9999 },
    { type: "hiring", roles: ["AE"] },
    { type: "astrology" },
    { type: "funding_news" },
    "nonsense",
  ]);
  assert.deepEqual(specs, [
    { type: "hiring", recencyDays: 180, roles: ["SDR"] },
    { type: "funding_news", recencyDays: 30 },
  ]);
});

test("keeps only known event kinds and returns [] for non-arrays", () => {
  assert.deepEqual(parseTriggers([{ type: "funding_news", eventKinds: ["funding", "meteor"], recencyDays: 14 }]), [
    { type: "funding_news", recencyDays: 14, eventKinds: ["funding"] },
  ]);
  assert.deepEqual(parseTriggers(undefined), []);
});
