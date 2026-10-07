import test from "node:test";
import assert from "node:assert/strict";
import { convertInput } from "./anthropic.ts";

test("a plain string becomes one user message", () => {
  assert.deepEqual(convertInput("hello"), [{ role: "user", content: [{ type: "text", text: "hello" }] }]);
});

test("a tool round trip becomes an assistant tool_use followed by a user tool_result", () => {
  const messages = convertInput([
    { role: "user", content: "find leads" },
    { type: "function_call", call_id: "call_1", name: "search", arguments: '{"q":"x"}' },
    { type: "function_call_output", call_id: "call_1", output: '{"ok":true}' },
  ] as never);
  assert.equal(messages.length, 3);
  assert.equal(messages[1].role, "assistant");
  assert.deepEqual(messages[1].content[0], { type: "tool_use", id: "call_1", name: "search", input: { q: "x" } });
  assert.deepEqual(messages[2].content[0], { type: "tool_result", tool_use_id: "call_1", content: '{"ok":true}' });
});

test("parallel calls merge into one assistant turn and tool results come before text in the user turn", () => {
  const messages = convertInput([
    { role: "user", content: "go" },
    { type: "function_call", call_id: "a", name: "one", arguments: "{}" },
    { type: "function_call", call_id: "b", name: "two", arguments: "{}" },
    { type: "function_call_output", call_id: "a", output: "1" },
    { type: "function_call_output", call_id: "b", output: "2" },
    { role: "user", content: "and then?" },
  ] as never);
  assert.equal(messages.length, 3);
  assert.equal(messages[1].content.length, 2);
  assert.deepEqual(messages[2].content.map((b) => b.type), ["tool_result", "tool_result", "text"]);
});

test("ids Anthropic would reject are made safe consistently, and a leading assistant turn gets a user opener", () => {
  const messages = convertInput([
    { role: "assistant", content: "earlier answer" },
    { type: "function_call", call_id: "step:1/x", name: "t", arguments: "{}" },
    { type: "function_call_output", call_id: "step:1/x", output: "{}" },
  ] as never);
  assert.equal(messages[0].role, "user");
  const use = messages[1].content.find((b) => b.type === "tool_use") as { id: string };
  const result = messages[2].content[0] as { tool_use_id: string };
  assert.equal(use.id, "step_1_x");
  assert.equal(result.tool_use_id, "step_1_x");
});
