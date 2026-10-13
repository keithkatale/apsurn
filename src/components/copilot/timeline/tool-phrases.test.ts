import assert from "node:assert/strict";
import { test } from "node:test";
import type { ToolItem } from "../../../lib/agents/timeline.ts";
import { formatElapsed, shortUrl, toolPhrase } from "./tool-phrases.ts";

function tool(partial: Partial<ToolItem> & Pick<ToolItem, "name">): ToolItem {
  return { kind: "tool", id: "a", args: {}, status: "running", startedAt: 0, progress: {}, ...partial };
}

test("a running search names its query; a finished one counts results", () => {
  assert.equal(toolPhrase(tool({ name: "web_search", args: { query: "seed rounds" } })), "Searching the web for “seed rounds”");
  assert.equal(
    toolPhrase(tool({ name: "web_search", args: { query: "seed rounds" }, status: "done", result: { results: [{}, {}, {}] } })),
    "Searched “seed rounds” · 3 results",
  );
});

test("a failed scrape says it could not read that page", () => {
  const phrase = toolPhrase(tool({ name: "web_scrape", args: { url: "https://www.example.com/blog/post" }, status: "failed", error: "robots" }));
  assert.equal(phrase, "Couldn’t read example.com/blog/post");
});

test("email tools say the verdict", () => {
  assert.equal(toolPhrase(tool({ name: "verify_email", args: { email: "a@b.co" }, status: "done", result: { status: "verified" } })), "a@b.co is a real mailbox");
  assert.equal(toolPhrase(tool({ name: "verify_email", args: { email: "a@b.co" }, status: "done", result: { status: "invalid" } })), "a@b.co is invalid");
});

test("helpers format urls and time", () => {
  assert.equal(shortUrl("https://www.techcrunch.com/"), "techcrunch.com");
  assert.equal(formatElapsed(4200), "4s");
  assert.equal(formatElapsed(72_000), "1m 12s");
});

test("a batch verification and a format search read naturally", () => {
  assert.equal(
    toolPhrase(tool({ name: "verify_email", args: { emails: ["a@b.co", "c@d.co", "e@f.co"] }, status: "done", result: { verified: 2 } })),
    "Verified 2 of 3 emails",
  );
  assert.equal(toolPhrase(tool({ name: "find_email", args: { fullName: "Ada Lovelace" }, progress: { formats: 13 } })), "Trying 13 email formats for Ada Lovelace");
});
