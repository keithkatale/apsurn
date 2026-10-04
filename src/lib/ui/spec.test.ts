import assert from "node:assert/strict";
import { test } from "node:test";
import { parseBlocks, safeHref, sanitizeBlocks } from "./spec.ts";

test("drops unknown and empty blocks", () => {
  const blocks = sanitizeBlocks([
    { type: "script", text: "alert(1)" },
    { type: "heading", text: "" },
    { type: "heading", text: "Plan", level: 2 },
    "nonsense",
    null,
  ]);
  assert.deepEqual(blocks, [{ type: "heading", text: "Plan", level: 2 }]);
});

test("only allows safe links", () => {
  assert.equal(safeHref("javascript:alert(1)"), undefined);
  assert.equal(safeHref("data:text/html,x"), undefined);
  assert.equal(safeHref("//evil.com"), undefined);
  assert.equal(safeHref("https://apsurn.com/x"), "https://apsurn.com/x");
  assert.equal(safeHref("/dashboard/library"), "/dashboard/library");
  assert.equal(safeHref("mailto:hello@apsurn.com"), "mailto:hello@apsurn.com");
});

test("table rows are limited to declared columns and stringified", () => {
  const [table] = sanitizeBlocks([
    { type: "table", columns: [{ key: "a", label: "A" }], rows: [{ a: 5, b: "hidden" }] },
  ]);
  assert.deepEqual(table, {
    type: "table",
    caption: undefined,
    accent: "neutral",
    striped: false,
    columns: [{ key: "a", label: "A" }],
    rows: [{ a: { text: "5" } }],
  });
});

test("button and image urls are filtered", () => {
  const blocks = sanitizeBlocks([
    { type: "buttons", items: [{ label: "Bad", action: "link", href: "javascript:x" }, { label: "Ask", action: "prompt", text: "Do it" }] },
    { type: "image", src: "http://insecure.example/x.png", alt: "x" },
  ]);
  assert.deepEqual(blocks, [{ type: "buttons", items: [{ label: "Ask", action: "prompt", text: "Do it" }] }]);
});

test("parseBlocks accepts a JSON string and survives bad JSON", () => {
  assert.equal(parseBlocks('[{"type":"divider"}]').length, 1);
  assert.deepEqual(parseBlocks("{not json"), []);
});

test("table cells can carry a colour tone; unknown tones are dropped", () => {
  const [table] = sanitizeBlocks([
    {
      type: "table",
      accent: "purple",
      columns: [{ key: "s", label: "Status" }],
      rows: [{ s: { text: "Won", tone: "green" } }, { s: { text: "?", tone: "hotpink" } }],
    },
  ]);
  assert.equal(table.type, "table");
  if (table.type === "table") {
    assert.equal(table.accent, "purple");
    assert.deepEqual(table.rows, [{ s: { text: "Won", tone: "green" } }, { s: { text: "?", tone: undefined } }]);
  }
});

test("interactive blocks are validated and nested blocks sanitized", () => {
  const blocks = sanitizeBlocks([
    { type: "select", id: "plan", label: "Plan", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }], value: "zzz" },
    { type: "select", id: "Bad Id", options: [{ value: "a" }, { value: "b" }] },
    { type: "toggle", id: "annual" },
    {
      type: "tabs",
      items: [{ label: "One", blocks: [{ type: "text", markdown: "hi", when: { id: "plan", equals: "a" } }, { type: "nope" }] }],
    },
    { type: "metric", label: "ARR", formula: "seats * 12", format: "currency" },
  ]);
  assert.deepEqual(blocks.map((b) => b.type), ["select", "toggle", "tabs", "metric"]);
  const select = blocks[0];
  if (select.type === "select") assert.equal(select.value, "a");
  const tabs = blocks[2];
  if (tabs.type === "tabs") {
    assert.equal(tabs.items[0].blocks.length, 1);
    assert.deepEqual(tabs.items[0].blocks[0].when, { id: "plan", equals: "a" });
  }
});

test("nesting depth is capped", () => {
  let inner: unknown = [{ type: "text", markdown: "deep" }];
  for (let i = 0; i < 6; i++) inner = [{ type: "tabs", items: [{ label: "t", blocks: inner }] }];
  const blocks = sanitizeBlocks(inner);
  let depth = 0;
  let cursor: unknown = blocks;
  while (Array.isArray(cursor) && cursor.length && (cursor[0] as { type: string }).type === "tabs") {
    depth++;
    cursor = (cursor[0] as { items: Array<{ blocks: unknown }> }).items[0].blocks;
  }
  assert.ok(depth <= 3);
});
