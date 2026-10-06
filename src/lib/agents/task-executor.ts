/**
 * Runs an approved agent task in resumable slices.
 *
 * Each slice: atomically claims the task (claim_agent_task RPC, 120s lease
 * renewed every 30s), runs pending steps until ~10 minutes pass, checkpoints
 * every step, then re-enqueues itself. A crashed slice just lets its lease
 * expire; the sweeper (/api/cron/agent-tasks) re-enqueues it and the step
 * that was mid-flight is retried (writes are idempotent; sends are gated).
 */
import { randomUUID } from "node:crypto";
import type { ResponseInputItem } from "openai/resources/responses/responses";
import { getAiClient, toFunctionTool } from "@/lib/ai/openai";
import { spendCredits } from "@/lib/billing/credits";
import { CREDIT_COSTS } from "@/lib/billing/plans";
import { enqueueInternalJob } from "@/lib/jobs/enqueue";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAccountBriefing } from "./briefing";
import { COPILOT_MUTATING_TOOLS, runCopilotTool } from "./copilot";
import { getSpecialist, isSpecialistId, specialistForTool } from "./delegate";
import { ORCHESTRATION_THINKING_BUDGET, runAgentLoop, type LoopToolCall } from "./loop";
import { appendTaskEvent, loadSteps, loadTask, setTaskStatus, updateStep, type AgentStepRow, type AgentTaskRow } from "./tasks";
import type { AgentToolContext, AgentToolEvent, SpecialistId } from "./types";

export const AGENT_TASK_JOB_PATH = "/api/jobs/agent-task";

/** Irreversible or outward-facing: never run from a plan without the user confirming that specific call. */
export const CONFIRM_REQUIRED_TOOLS = new Set(["send_email_now", "run_send_pass", "activate_sequence"]);

const LEASE_SECONDS = 120;
const HEARTBEAT_MS = 30_000;
const MAX_STEP_ATTEMPTS = 2;
const MAX_STEP_ROUNDS = 8;
const ACTIVE_RUN_STATUSES = ["queued", "discovering", "enriching", "verifying"];

function sliceBudgetMs(): number {
  const configured = Number(process.env.AGENT_SLICE_MS ?? "");
  return Number.isFinite(configured) && configured > 0 ? configured : 600_000;
}

export function enqueueAgentTask(taskId: string) {
  enqueueInternalJob(AGENT_TASK_JOB_PATH, { taskId }, () => executeAgentTaskSlice(taskId));
}

function summarize(value: unknown, max = 1200): string {
  if (typeof value === "string") return value.slice(0, max);
  try {
    return JSON.stringify(value).slice(0, max);
  } catch {
    return "";
  }
}

function errorCode(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code;
}

/** A prospecting run a step started and must now wait for. */
function startedRunId(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const row = result as Record<string, unknown>;
  return row.queued === true && typeof row.runId === "string" ? row.runId : null;
}

async function runAnyTool(ctx: AgentToolContext, name: string, args: Record<string, unknown>) {
  const specialist = specialistForTool(name);
  return specialist ? specialist.runTool(ctx, name, args) : runCopilotTool(ctx, name, args);
}

interface StepOutcome {
  kind: "done" | "failed" | "waiting" | "confirm" | "budget" | "cancelled";
  summary?: string;
  runId?: string;
  pending?: LoopToolCall;
}

class Halt extends Error {
  constructor(readonly outcome: StepOutcome) {
    super(outcome.kind);
  }
}

async function runStep(task: AgentTaskRow, step: AgentStepRow, priorSummaries: string[], isCancelled: () => boolean): Promise<StepOutcome> {
  const db = createAdminClient();
  let halted: StepOutcome | null = null;
  let waitingRunId: string | null = null;

  // Batch model text so the events table gets a few rows per round, not one per token.
  let textBuffer = "";
  const flushText = async () => {
    if (!textBuffer.trim()) return;
    const text = textBuffer;
    textBuffer = "";
    await appendTaskEvent(db, task.id, "reasoning", { stepId: step.id, agent: step.agent, text });
  };

  const ctx: AgentToolContext = {
    db,
    userId: task.user_id,
    conversationId: task.conversation_id ?? undefined,
    parentId: step.id,
    taskId: task.id,
    isCancelled: () => isCancelled() || halted !== null,
    emit: (event: AgentToolEvent) => {
      void appendTaskEvent(db, task.id, event.type, { ...event, stepId: step.id });
    },
  };

  // The one gate that can't be bypassed by a plan or a prompt: outward-facing calls need explicit confirmation.
  const guardedRun = async (call: LoopToolCall) => {
    if (CONFIRM_REQUIRED_TOOLS.has(call.name)) {
      const confirmed = step.output?.confirmed === true && (step.output?.pending as { name?: string } | undefined)?.name === call.name;
      if (!confirmed) {
        halted = { kind: "confirm", pending: call };
        return { paused: true, note: "Waiting for the user to confirm this action." };
      }
    }
    try {
      const result = await runAnyTool(ctx, call.name, { ...call.args, ...(CONFIRM_REQUIRED_TOOLS.has(call.name) ? { confirmed: true } : {}) });
      const runId = startedRunId(result);
      if (runId) waitingRunId = runId;
      return result;
    } catch (error) {
      if (errorCode(error) === "budget_exhausted") halted = { kind: "budget" };
      throw error;
    }
  };

  try {
    await spendCredits({ userId: task.user_id, amount: CREDIT_COSTS.copilot_turn, action: "agent_step", metadata: { stepId: step.id }, taskId: task.id });

    // A step resuming after the user confirmed its paused call: run exactly that call, nothing else.
    const pending = step.output?.pending as LoopToolCall | undefined;
    if (pending && step.output?.confirmed === true) {
      await appendTaskEvent(db, task.id, "tool_start", { id: pending.id, name: pending.name, args: pending.args, stepId: step.id });
      const result = await guardedRun(pending);
      await appendTaskEvent(db, task.id, "tool_end", { id: pending.id, name: pending.name, args: pending.args, result, stepId: step.id });
      return { kind: "done", summary: `${pending.name}: ${summarize(result, 600)}` };
    }

    if (step.tool) {
      const call = { id: `step-${step.id}`, name: step.tool, args: step.args ?? {} };
      await appendTaskEvent(db, task.id, "tool_start", { ...call, stepId: step.id });
      const result = await guardedRun(call);
      await appendTaskEvent(db, task.id, "tool_end", { ...call, result, stepId: step.id });
      if (halted) throw new Halt(halted);
      if (waitingRunId) return { kind: "waiting", runId: waitingRunId, summary: `Started run ${waitingRunId}.` };
      return { kind: "done", summary: summarize(result, 1000) };
    }

    // signal_scout is a researcher profile until its own specialist lands.
    const agentId: SpecialistId = isSpecialistId(step.agent) ? step.agent : "researcher";
    const specialist = getSpecialist(agentId);
    const briefing = await loadAccountBriefing(ctx);
    const input: ResponseInputItem[] = [
      { role: "user", content: `Account briefing (authoritative — do not interview anyone for these facts):\n${briefing}` },
      {
        role: "user",
        content: [
          `Overall goal: ${task.goal}`,
          priorSummaries.length ? `Earlier steps already finished:\n${priorSummaries.map((s, i) => `${i + 1}. ${s}`).join("\n")}` : "",
          `Your step: ${step.title}\n${step.instruction}`,
          "Do the work with your tools now. Do not ask questions — decide from the briefing. Finish with a one-paragraph summary of what you did with real names and numbers.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ];

    const { ai, model } = await getAiClient();
    const loop = await runAgentLoop({
      ai,
      model,
      instructions: specialist.instruction,
      tools: specialist.tools.map(toFunctionTool),
      input,
      maxRounds: MAX_STEP_ROUNDS,
      thinkingBudget: ORCHESTRATION_THINKING_BUDGET,
      isCancelled: () => isCancelled() || halted !== null,
      isParallelSafe: (name) => !COPILOT_MUTATING_TOOLS.has(name),
      onText: (delta) => {
        textBuffer += delta;
      },
      onToolStart: (call) => {
        void flushText();
        void appendTaskEvent(db, task.id, "tool_start", { ...call, agent: agentId, stepId: step.id });
      },
      onToolEnd: (done) => {
        void appendTaskEvent(db, task.id, "tool_end", { ...done, agent: agentId, stepId: step.id });
      },
      runTool: guardedRun,
    });
    await flushText();

    if (halted) throw new Halt(halted);
    if (loop.cancelled) return { kind: "cancelled" };
    if (waitingRunId) return { kind: "waiting", runId: waitingRunId, summary: loop.finalText || `Started run ${waitingRunId}.` };
    const summary = loop.finalText.trim() || loop.toolResults.map((r) => `${r.name}: ${summarize(r.result, 200)}`).join("\n") || "Done.";
    return { kind: "done", summary };
  } catch (error) {
    if (error instanceof Halt) return error.outcome;
    if (errorCode(error) === "budget_exhausted") return { kind: "budget" };
    if (errorCode(error) === "credits_exhausted") return { kind: "failed", summary: "Out of credits. Top up to continue." };
    return { kind: "failed", summary: error instanceof Error ? error.message : "Step failed" };
  }
}

/** A step waiting on a prospecting run: done once the run reaches a terminal status. */
async function resolveWaitingStep(step: AgentStepRow): Promise<"still_waiting" | "resolved"> {
  if (!step.run_id) return "resolved";
  const db = createAdminClient();
  const { data: run } = await db
    .from("prospecting_runs")
    .select("status, processed_count, contact_count, target_count, error_summary")
    .eq("id", step.run_id)
    .maybeSingle();
  if (run && ACTIVE_RUN_STATUSES.includes(run.status)) return "still_waiting";
  const summary = run
    ? `Prospecting run ${run.status}: saved ${run.processed_count}/${run.target_count} companies, ${run.contact_count} contacts${run.error_summary ? ` (${run.error_summary})` : ""}.`
    : "The prospecting run could not be found.";
  await updateStep(db, step, {
    status: run && run.status !== "failed" ? "done" : "failed",
    result_summary: summary,
    finished_at: new Date().toISOString(),
  });
  return "resolved";
}

async function finishTask(task: AgentTaskRow, steps: AgentStepRow[]) {
  const db = createAdminClient();
  const lines = steps.map((s) => `- ${s.title} [${s.status}]: ${s.result_summary ?? ""}`).join("\n");
  let summary = `Finished "${task.goal}".\n\n${lines}`;
  try {
    const { ai, model } = await getAiClient();
    const response = await ai.responses.create({
      model,
      thinking_budget: 0,
      max_output_tokens: 600,
      input: `You ran a multi-step task for the user. Write a short, concrete wrap-up (3-6 sentences or a tight bullet list): what was done, real names and numbers, anything that failed and what to do next. No preamble.\n\nGoal: ${task.goal}\n\nStep results:\n${lines}`,
    });
    if (typeof response.output_text === "string" && response.output_text.trim()) summary = response.output_text.trim();
  } catch {
    // The plain step list above is a fine fallback.
  }

  if (task.conversation_id) {
    await db.from("copilot_messages").insert({ conversation_id: task.conversation_id, role: "model", content: summary, metadata: { taskId: task.id } });
    await db.from("copilot_conversations").update({ updated_at: new Date().toISOString() }).eq("id", task.conversation_id);
  }
  const anyFailed = steps.some((s) => s.status === "failed");
  await setTaskStatus(db, task.id, anyFailed && steps.every((s) => s.status !== "done") ? "failed" : "completed");
  await appendTaskEvent(db, task.id, "task_summary", { summary });
}

export async function executeAgentTaskSlice(taskId: string): Promise<{ claimed: boolean; status?: string }> {
  const db = createAdminClient();
  const owner = randomUUID();
  const { data: claimedRows, error: claimError } = await db.rpc("claim_agent_task", {
    p_task: taskId,
    p_owner: owner,
    p_lease_seconds: LEASE_SECONDS,
  });
  if (claimError) {
    console.error("[agent-task] claim failed", taskId, claimError.message);
    return { claimed: false };
  }
  const task = (claimedRows as AgentTaskRow[] | null)?.[0];
  if (!task) return { claimed: false };

  let cancelled = false;
  const heartbeat = setInterval(async () => {
    const { data } = await db
      .from("agent_tasks")
      .update({ lease_expires_at: new Date(Date.now() + LEASE_SECONDS * 1000).toISOString() })
      .eq("id", taskId)
      .eq("lease_owner", owner)
      .select("status")
      .maybeSingle();
    if (!data || data.status === "cancelling") cancelled = true;
  }, HEARTBEAT_MS);

  const releaseLease = (status: AgentTaskRow["status"], extra: Record<string, unknown> = {}) =>
    setTaskStatus(db, taskId, status, { lease_owner: null, lease_expires_at: null, ...extra });

  try {
    const deadline = Date.now() + sliceBudgetMs();
    if (task.status !== "running") await setTaskStatus(db, taskId, "running");

    while (true) {
      const fresh = await loadTask(db, taskId);
      if (!fresh || fresh.status === "cancelling" || cancelled) {
        await releaseLease("cancelled");
        return { claimed: true, status: "cancelled" };
      }

      const steps = await loadSteps(db, taskId);

      const waiting = steps.find((s) => s.status === "running" && s.run_id);
      if (waiting) {
        if ((await resolveWaitingStep(waiting)) === "still_waiting") {
          await releaseLease("waiting");
          return { claimed: true, status: "waiting" };
        }
        continue;
      }

      const next = steps.find((s) => s.status === "pending" || s.status === "running");
      if (!next) {
        await finishTask(fresh, steps);
        return { claimed: true, status: "completed" };
      }
      if (Date.now() >= deadline) {
        await releaseLease("queued");
        enqueueAgentTask(taskId);
        return { claimed: true, status: "continued" };
      }

      // A step left "running" with no run is a slice that died mid-step: retry it, a bounded number of times.
      if (next.status === "running" && next.attempts >= MAX_STEP_ATTEMPTS) {
        await updateStep(db, next, { status: "failed", result_summary: "Stopped after repeated interruptions.", finished_at: new Date().toISOString() });
        continue;
      }

      await updateStep(db, next, { status: "running", attempts: next.attempts + 1, started_at: new Date().toISOString() });
      const prior = steps.filter((s) => s.status === "done" && s.result_summary).map((s) => `${s.title}: ${s.result_summary}`);
      const outcome = await runStep(fresh, { ...next, attempts: next.attempts + 1 }, prior, () => cancelled);
      const now = new Date().toISOString();

      switch (outcome.kind) {
        case "done":
          await updateStep(db, next, { status: "done", result_summary: outcome.summary ?? "Done.", finished_at: now, output: {} });
          break;
        case "failed":
          await updateStep(db, next, { status: "failed", result_summary: outcome.summary ?? "Failed.", finished_at: now });
          break;
        case "waiting":
          await updateStep(db, next, { run_id: outcome.runId, result_summary: outcome.summary ?? null });
          await releaseLease("waiting");
          return { claimed: true, status: "waiting" };
        case "confirm":
          await updateStep(db, next, { status: "awaiting_confirmation", output: { pending: outcome.pending, confirmed: false } });
          await appendTaskEvent(db, taskId, "confirm_required", { stepId: next.id, title: next.title, tool: outcome.pending?.name, args: outcome.pending?.args });
          await releaseLease("paused");
          return { claimed: true, status: "paused" };
        case "budget":
          // Not an interruption: give the attempt back so raising the budget resumes cleanly.
          await updateStep(db, next, { status: "pending", attempts: next.attempts, result_summary: "Paused: the task reached its credit budget." });
          await releaseLease("paused", { error: "Budget reached — raise the budget to continue." });
          return { claimed: true, status: "paused" };
        case "cancelled":
          await updateStep(db, next, { status: "skipped", result_summary: "Cancelled.", finished_at: now });
          await releaseLease("cancelled");
          return { claimed: true, status: "cancelled" };
      }
    }
  } catch (error) {
    console.error("[agent-task] slice failed", taskId, error);
    await releaseLease("failed", { error: error instanceof Error ? error.message : "Task failed" });
    return { claimed: true, status: "failed" };
  } finally {
    clearInterval(heartbeat);
  }
}
