import assert from "node:assert/strict";
import { test } from "node:test";
import { applyEvent, compactResult, emptyRun, reduceRun, settleTimeline } from "./timeline.ts";

test("text and reasoning deltas merge into one item each, in order", () => {
  let items = applyEvent([], { type: "reasoning", text: "Let me " });
  items = applyEvent(items, { type: "reasoning", text: "search." });
  items = applyEvent(items, { type: "tool_start", id: "a", name: "web_search", args: { query: "x" }, at: 1 });
  items = applyEvent(items, { type: "text", text: "Found " });
  items = applyEvent(items, { type: "text", text: "two." });
  assert.deepEqual(items.map((item) => item.kind), ["reasoning", "tool", "text"]);
  assert.equal((items[0] as { text: string }).text, "Let me search.");
  assert.equal((items[2] as { text: string }).text, "Found two.");
});

test("a tool runs, reports progress, and ends done or failed", () => {
  let items = applyEvent([], { type: "tool_start", id: "a", name: "web_scrape", args: { url: "https://x.test" }, at: 5 });
  items = applyEvent(items, { type: "tool_progress", id: "a", patch: { stage: "fetching" } });
  assert.equal((items[0] as { status: string }).status, "running");
  assert.deepEqual((items[0] as { progress: unknown }).progress, { stage: "fetching" });
  items = applyEvent(items, { type: "tool_end", id: "a", ok: false, error: "blocked by robots.txt", ms: 800 });
  const tool = items[0] as { status: string; error?: string; ms?: number };
  assert.equal(tool.status, "failed");
  assert.equal(tool.error, "blocked by robots.txt");
  assert.equal(tool.ms, 800);
});

test("replaying an event with an old sequence changes nothing", () => {
  let state = reduceRun(emptyRun(), 1, { type: "text", text: "Hi" });
  state = reduceRun(state, 2, { type: "text", text: "!" });
  const replayed = reduceRun(state, 2, { type: "text", text: "!" });
  assert.equal(replayed, state);
  assert.equal((state.items[0] as { text: string }).text, "Hi!");
});

test("run status follows terminal events", () => {
  let state = reduceRun(emptyRun(), 1, { type: "status", label: "Searching the web…" });
  assert.equal(state.label, "Searching the web…");
  state = reduceRun(state, 2, { type: "error", message: "boom" });
  assert.equal(state.status, "error");
  assert.equal(state.error, "boom");
  assert.equal(reduceRun(emptyRun(), 1, { type: "done" }).status, "done");
  assert.equal(reduceRun(emptyRun(), 1, { type: "cancelled" }).status, "cancelled");
});

test("settling closes tools that were still running", () => {
  const items = applyEvent([], { type: "tool_start", id: "a", name: "web_search", args: {}, at: 1 });
  const settled = settleTimeline(items, "The run stopped before this finished.");
  assert.equal((settled[0] as { status: string }).status, "failed");
});

test("compacting drops page text but keeps what the UI shows", () => {
  const compact = compactResult({ url: "https://x.test", title: "X", text: "a".repeat(5000), links: Array.from({ length: 40 }, (_, i) => `https://x.test/${i}`) }) as Record<string, unknown>;
  assert.equal(compact.text, undefined);
  assert.equal(compact.textChars, 5000);
  assert.equal((compact.links as string[]).length, 10);
  assert.equal(compact.title, "X");
});
