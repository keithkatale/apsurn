import test from "node:test";
import assert from "node:assert/strict";
import { convertInput } from "./vertex.ts";

test("parallel function calls stay in one model turn and keep the first signature", () => {
  const contents = convertInput(
    [
      { role: "user", content: "find leads" },
      { type: "function_call", call_id: "a", name: "one", arguments: "{}", thought_signature: "sig-a" },
      { type: "function_call", call_id: "b", name: "two", arguments: '{"q":1}' },
      { type: "function_call_output", call_id: "a", output: '{"ok":true}' },
      { type: "function_call_output", call_id: "b", output: "plain" },
    ] as never,
    "gemini-3.8-flash",
  );
  assert.equal(Array.isArray(contents), true);
  if (!Array.isArray(contents)) return;
  assert.equal(contents.length, 3);
  assert.equal(contents[1].role, "model");
  assert.equal(contents[1].parts.length, 2);
  assert.equal(contents[1].parts[0].thoughtSignature, "sig-a");
  assert.equal("thoughtSignature" in contents[1].parts[1], false);
  assert.equal(contents[2].role, "user");
  assert.equal(contents[2].parts.length, 2);
});

test("a function call with no signature gets the documented bypass on Gemini 3 and 4", () => {
  const contents = convertInput(
    [
      { role: "user", content: "find leads" },
      { type: "function_call", call_id: "a", name: "search", arguments: "{}" },
      { type: "function_call_output", call_id: "a", output: "{}" },
    ] as never,
    "gemini-4-argon",
  );
  if (!Array.isArray(contents)) throw new Error("expected contents");
  assert.equal(contents[1].parts[0].thoughtSignature, "skip_thought_signature_validator");
});
