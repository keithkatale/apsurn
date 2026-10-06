import test from "node:test";
import assert from "node:assert/strict";
import { canRunInParallel, runAgentLoop, safeParseArgs } from "./loop.ts";

test("safeParseArgs accepts objects and rejects malformed or non-object JSON", () => {
  assert.deepEqual(safeParseArgs('{"a":1}'), { ok: true, args: { a: 1 } });
  assert.deepEqual(safeParseArgs(""), { ok: true, args: {} });
  assert.equal(safeParseArgs("{not json").ok, false);
  assert.equal(safeParseArgs("[1,2]").ok, false);
});

test("a round runs in parallel only when every call is read-only", () => {
  const readOnly = (name: string) => name.startsWith("list_");
  assert.equal(canRunInParallel(["list_a", "list_b"], readOnly), true);
  assert.equal(canRunInParallel(["list_a", "create_x"], readOnly), false);
  assert.equal(canRunInParallel(["list_a"], readOnly), false);
});

type FakeCall = { name: string; arguments: string };

/** A fake streaming client: each create() returns the next scripted round. */
function fakeClient(rounds: Array<{ text?: string; calls?: FakeCall[] }>) {
  let index = 0;
  return {
    responses: {
      async create() {
        const round = rounds[index++] ?? { text: "" };
        return (async function* () {
          if (round.text) yield { type: "response.output_text.delta", delta: round.text };
          const output: unknown[] = (round.calls ?? []).map((call, i) => ({
            type: "function_call",
            call_id: `c${index}_${i}`,
            name: call.name,
            arguments: call.arguments,
          }));
          yield { type: "response.completed", response: { output } };
        })();
      },
    },
  };
}

test("runs read-only calls concurrently, returns outputs in call order, and reports bad JSON to the model", async () => {
  const started: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const input: never[] = [];
  const result = await runAgentLoop({
    ai: fakeClient([
      {
        calls: [
          { name: "list_slow", arguments: "{}" },
          { name: "list_fast", arguments: "{}" },
          { name: "list_bad", arguments: "{oops" },
        ],
      },
      { text: "All done." },
    ]),
    model: "m",
    instructions: "",
    tools: [],
    input,
    maxRounds: 4,
    isParallelSafe: (name) => name.startsWith("list_"),
    runTool: async (call) => {
      started.push(call.name);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, call.name === "list_slow" ? 30 : 5));
      inFlight--;
      return { ok: call.name };
    },
  });

  assert.equal(result.finalText, "All done.");
  assert.equal(maxInFlight, 2);
  assert.deepEqual(started.sort(), ["list_fast", "list_slow"]);
  const outputs = (input as Array<{ type?: string; output?: string }>).filter((item) => item.type === "function_call_output");
  assert.deepEqual(
    outputs.map((item) => JSON.parse(item.output ?? "{}")),
    [{ ok: "list_slow" }, { ok: "list_fast" }, { error: "Tool arguments were not valid JSON. Re-issue the call with a valid JSON object." }],
  );
});

test("mutating calls run sequentially and the loop reports exhaustion", async () => {
  const order: string[] = [];
  const result = await runAgentLoop({
    ai: fakeClient([{ calls: [{ name: "create_a", arguments: "{}" }, { name: "list_b", arguments: "{}" }] }]),
    model: "m",
    instructions: "",
    tools: [],
    input: [],
    maxRounds: 1,
    isParallelSafe: (name) => name.startsWith("list_"),
    runTool: async (call) => {
      order.push(`start:${call.name}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push(`end:${call.name}`);
      return {};
    },
  });
  assert.deepEqual(order, ["start:create_a", "end:create_a", "start:list_b", "end:list_b"]);
  assert.equal(result.exhausted, true);
});

test("stops before calling the model when cancelled", async () => {
  let calls = 0;
  const result = await runAgentLoop({
    ai: { responses: { create: async () => { calls++; throw new Error("should not run"); } } },
    model: "m",
    instructions: "",
    tools: [],
    input: [],
    maxRounds: 3,
    isParallelSafe: () => true,
    runTool: async () => ({}),
    isCancelled: () => true,
  });
  assert.equal(result.cancelled, true);
  assert.equal(calls, 0);
});
