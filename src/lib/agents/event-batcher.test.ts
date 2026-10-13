import assert from "node:assert/strict";
import { test } from "node:test";
import { createBatcher } from "./event-batcher.ts";
import type { RunEvent } from "./run-events.ts";

function harness() {
  const written: RunEvent[][] = [];
  let pending: (() => void) | null = null;
  const batcher = createBatcher({
    write: async (events) => {
      written.push(events);
    },
    setTimer: (fn) => {
      pending = fn;
      return 1;
    },
    clearTimer: () => {
      pending = null;
    },
  });
  return { batcher, written, fire: () => pending?.() };
}

test("text deltas merge and wait for the timer", async () => {
  const { batcher, written, fire } = harness();
  batcher.push({ type: "text", text: "Hel" });
  batcher.push({ type: "text", text: "lo" });
  await Promise.resolve();
  assert.equal(written.length, 0);
  fire();
  await batcher.flush();
  assert.deepEqual(written, [[{ type: "text", text: "Hello" }]]);
});

test("a tool event flushes buffered text first, in order", async () => {
  const { batcher, written } = harness();
  batcher.push({ type: "text", text: "Searching." });
  batcher.push({ type: "tool_start", id: "a", name: "web_search", args: {}, at: 1 });
  await batcher.flush();
  assert.deepEqual(written.flat().map((event) => event.type), ["text", "tool_start"]);
});

test("a failed write does not break later writes", async () => {
  let calls = 0;
  const batcher = createBatcher({
    write: async () => {
      calls += 1;
      if (calls === 1) throw new Error("db down");
    },
  });
  batcher.push({ type: "status", label: "a" });
  batcher.push({ type: "status", label: "b" });
  await batcher.flush();
  assert.equal(calls, 2);
});
