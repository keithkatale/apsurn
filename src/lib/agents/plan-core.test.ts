import test from "node:test";
import assert from "node:assert/strict";
import { estimatePlanCost, leadTargetOf, validatePlan, type PlanStep } from "./plan-core.ts";

const COSTS = { copilot_turn: 2, prospect_company: 3, email_find: 5, email_draft: 1, market_scan: 15, lead_source_scan: 8 };

test("validatePlan rejects missing goals, unknown agents, and oversized plans", () => {
  assert.equal(validatePlan({ steps: [] }).ok, false);
  assert.equal(validatePlan({ goal: "x", steps: [{ title: "a", agent: "wizard", instruction: "b" }] }).ok, false);
  const tooMany = Array.from({ length: 9 }, () => ({ title: "a", agent: "writer", instruction: "b" }));
  assert.equal(validatePlan({ goal: "x", steps: tooMany }).ok, false);
});

test("validatePlan keeps well-formed steps and drops non-object args", () => {
  const result = validatePlan({
    goal: " Find leads ",
    steps: [{ title: "Find", agent: "researcher", instruction: "Find 20 companies", args: [1, 2] }],
  });
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.plan.goal, "Find leads");
  assert.equal(result.plan.steps[0].args, undefined);
});

test("leadTargetOf prefers explicit args, then the instruction, then 10", () => {
  const base: PlanStep = { title: "Find", agent: "researcher", instruction: "Find 25 SaaS companies hiring SDRs" };
  assert.equal(leadTargetOf(base), 25);
  assert.equal(leadTargetOf({ ...base, args: { limit: 7 } }), 7);
  assert.equal(leadTargetOf({ ...base, instruction: "Find companies that just raised" }), 10);
});

test("estimatePlanCost gives a range where the high end assumes every lookup is paid", () => {
  const steps: PlanStep[] = [
    { title: "Find", agent: "researcher", instruction: "Find 10 leads" },
    { title: "Draft", agent: "writer", instruction: "Draft 10 emails" },
  ];
  const estimate = estimatePlanCost(steps, COSTS);
  // researcher: 6 turns + 10 × (3+5) = 86; writer: 6 + 10 × 1 = 16
  assert.deepEqual(estimate.perStep, [86, 16]);
  assert.equal(estimate.high, 102);
  // low: researcher 6 + 5×8 + 5×3 = 61; writer 16
  assert.equal(estimate.low, 77);
  assert.ok(estimate.low < estimate.high);
});
