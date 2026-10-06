import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPlanMessage,
  buildRunCompletedMessage,
  formatRunOutcome,
  isActiveRunStatus,
  pendingSteps,
  type PlanStepLine,
  type RunOutcome,
} from "./wakeup-messages.ts";

const outcome: RunOutcome = {
  runId: "run-1",
  status: "completed",
  target: 10,
  saved: 2,
  contacts: 3,
  error: null,
  companies: [
    {
      name: "Acme",
      domain: "acme.com",
      industry: "SaaS",
      fit: 0.9,
      reason: "Hiring 3 SDRs",
      contacts: [{ name: "Jo Park", title: "VP Sales", email: "jo@acme.com", emailStatus: "verified" }],
    },
    { name: "Globex", domain: "globex.io", industry: "", fit: null, reason: "", contacts: [] },
  ],
  signals: ["Acme is hiring 3 SDRs"],
};

const steps: PlanStepLine[] = [
  { idx: 0, title: "Find leads", agent: "researcher", instruction: "x", status: "running" },
  { idx: 1, title: "Draft emails", agent: "writer", instruction: "y", status: "pending" },
  { idx: 2, title: "Done already", agent: "operator", instruction: "z", status: "done", resultSummary: "ok" },
];

test("isActiveRunStatus only matches in-flight statuses", () => {
  assert.equal(isActiveRunStatus("discovering"), true);
  assert.equal(isActiveRunStatus("completed"), false);
  assert.equal(isActiveRunStatus(null), false);
});

test("formatRunOutcome lists counts, companies, contacts and signals", () => {
  const text = formatRunOutcome(outcome);
  assert.match(text, /saved 2\/10 companies, 3 contacts/);
  assert.match(text, /Acme \(acme\.com\) SaaS fit 0\.9 — why: Hiring 3 SDRs/);
  assert.match(text, /Jo Park, VP Sales <jo@acme\.com> \[verified\]/);
  assert.match(text, /Acme is hiring 3 SDRs/);
});

test("formatRunOutcome says so when nothing was saved", () => {
  const text = formatRunOutcome({ ...outcome, saved: 0, contacts: 0, companies: [], signals: [], error: "provider down" });
  assert.match(text, /No companies were saved/);
  assert.match(text, /Problem: provider down/);
});

test("pendingSteps excludes done, failed and skipped steps", () => {
  assert.deepEqual(
    pendingSteps(steps).map((s) => s.idx),
    [0, 1],
  );
});

test("run-completed message only mentions the plan while steps remain", () => {
  assert.doesNotMatch(buildRunCompletedMessage(outcome, null), /approved plan/);
  assert.match(buildRunCompletedMessage(outcome, { goal: "Fill pipeline", steps }), /approved plan "Fill pipeline"/);
  const finished = steps.map((s) => ({ ...s, status: "done" }));
  assert.doesNotMatch(buildRunCompletedMessage(outcome, { goal: "Fill pipeline", steps: finished }), /approved plan/);
});

test("plan message numbers steps from 1 and tells the agent not to re-ask approval", () => {
  const text = buildPlanMessage("approved", "Fill pipeline", steps);
  assert.match(text, /1\. Find leads \(researcher\)/);
  assert.match(text, /3\. Done already \(operator\) \[done\] — ok/);
  assert.match(text, /Do not ask the user to approve again/);
  assert.match(buildPlanMessage("continue", "g", steps), /Continue the approved plan/);
});
