import type { ResponseInputItem } from "openai/resources/responses/responses";
import { getAiClient, toFunctionTool } from "@/lib/ai/openai";
// Used only inside functions, so the copilot ↔ delegate import cycle is safe.
import { COPILOT_MUTATING_TOOLS } from "./copilot";
import { ORCHESTRATION_THINKING_BUDGET, runAgentLoop } from "./loop";
import { loadAccountBriefing, looksLikeQuestion, resultNeedsLeads, wantsNewLeads, wantsSequenceCreated } from "./briefing";
import { userCompanyId } from "./shared";
import { listener } from "./listener";
import { createSequenceFromBlueprint, operator } from "./operator";
import { researcher } from "./researcher";
import { writer } from "./writer";
import type { AgentToolContext, SpecialistId, SpecialistModule } from "./types";
import { SPECIALIST_IDS } from "./types";

const SPECIALISTS: Record<SpecialistId, SpecialistModule> = {
  researcher,
  listener,
  writer,
  operator,
};

const MAX_SPECIALIST_ROUNDS = 6;

export function getSpecialist(id: SpecialistId): SpecialistModule {
  return SPECIALISTS[id];
}

export function isSpecialistId(value: unknown): value is SpecialistId {
  return typeof value === "string" && (SPECIALIST_IDS as readonly string[]).includes(value);
}

export function specialistForTool(name: string): SpecialistModule | null {
  for (const specialist of Object.values(SPECIALISTS)) {
    if (specialist.tools.some((tool) => tool.name === name)) return specialist;
  }
  return null;
}

export async function runSpecialistTool(ctx: AgentToolContext, name: string, args: Record<string, unknown>) {
  const specialist = specialistForTool(name);
  if (!specialist) throw new Error(`Unknown tool: ${name}`);
  return specialist.runTool(ctx, name, args);
}

export async function getAgentStatus(ctx: AgentToolContext, args: Record<string, unknown>) {
  const kind = args.kind === "market" || args.kind === "prospecting" ? args.kind : "all";
  const result: Record<string, unknown> = {};

  if (kind === "prospecting" || kind === "all") {
    let query = ctx.db
      .from("prospecting_runs")
      .select("id, status, stage, target_count, processed_count, contact_count, error_summary, created_at, completed_at, updated_at")
      .eq("user_id", ctx.userId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (typeof args.runId === "string") {
      query = ctx.db
        .from("prospecting_runs")
        .select("id, status, stage, target_count, processed_count, contact_count, error_summary, created_at, completed_at, updated_at")
        .eq("user_id", ctx.userId)
        .eq("id", args.runId)
        .limit(1);
    }
    const { data: run } = await query.maybeSingle();
    result.prospecting = run ?? null;
  }

  if (kind === "market" || kind === "all") {
    const companyId = await userCompanyId(ctx.db, ctx.userId);
    if (!companyId) {
      result.market = { message: "No company yet." };
    } else {
      const [{ data: keywords }, { data: accounts }] = await Promise.all([
        ctx.db.from("market_keywords").select("keyword, is_active, last_scanned_at").eq("company_id", companyId),
        ctx.db.from("market_accounts").select("handle, platform, is_followed, last_scanned_at").eq("company_id", companyId).eq("is_followed", true),
      ]);
      result.market = {
        keywords: keywords ?? [],
        followedAccounts: accounts ?? [],
      };
    }
  }

  return result;
}

export async function delegateToAgent(
  ctx: AgentToolContext,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (!isSpecialistId(args.agent)) {
    return { error: `Unknown agent. Use one of: ${SPECIALIST_IDS.join(", ")}` };
  }
  const task = typeof args.task === "string" ? args.task.trim() : "";
  if (!task) return { error: "A task is required." };

  const agentId = args.agent === "writer" && wantsSequenceCreated(task) ? "operator" : args.agent;
  const specialist = SPECIALISTS[agentId];
  const confirmed = args.confirmed === true;
  const briefing = await loadAccountBriefing(ctx);
  const assignedTask =
    specialist.id === "researcher" && wantsNewLeads(task)
      ? `${task}\n\nFind leads that have a reason to buy what this account sells. Read the value prop in the briefing, pick the buying signals that fit it (hiring for a role it replaces or supports, recent funding or launches, people posting about the problem it solves), and call start_signal_scout with those triggers, keywords drawn from the value prop, and a recency window. Use start_prospecting_run only if the task explicitly asks for a plain ICP or directory pull. Do not ask for industries, geographies, or personas.`
      : specialist.id === "operator" && wantsSequenceCreated(task)
        ? `${task}\n\nWrite the email subject and body yourself from the briefing. Call create_sequence now with a 3-step sequence. Do not ask anyone for copy.`
        : task;
  const { ai, model } = await getAiClient();
  const tools = specialist.tools.map(toFunctionTool);
  const input: ResponseInputItem[] = [
    {
      role: "user",
      content: `Account briefing (authoritative — do not interview anyone for these facts):\n${briefing}`,
    },
    {
      role: "user",
      content: confirmed
        ? `${assignedTask}\n\nThe user already confirmed any send or destructive action in this task.`
        : assignedTask,
    },
  ];

  let reasoning = "";
  let resumedFromQuestion = false;
  const emitReasoning = (text: string) => {
    reasoning += text;
    ctx.emit?.({ type: "reasoning", name: specialist.id, agent: specialist.id, text, parentId: ctx.parentId });
  };

  const loop = await runAgentLoop({
    ai,
    model,
    instructions: specialist.instruction,
    tools,
    input,
    maxRounds: MAX_SPECIALIST_ROUNDS,
    thinkingBudget: ORCHESTRATION_THINKING_BUDGET,
    isCancelled: ctx.isCancelled,
    isParallelSafe: (name) => !COPILOT_MUTATING_TOOLS.has(name),
    prepareArgs: (call) =>
      confirmed && (call.name === "run_send_pass" || call.name === "send_email_now") && call.args.confirmed !== true
        ? { ...call.args, confirmed: true }
        : call.args,
    onText: emitReasoning,
    onThought: emitReasoning,
    onToolStart: (call) =>
      ctx.emit?.({ type: "tool_start", id: call.id, name: call.name, agent: specialist.id, args: call.args, parentId: ctx.parentId }),
    onToolEnd: (done) =>
      ctx.emit?.({
        type: "tool_end",
        id: done.id,
        name: done.name,
        agent: specialist.id,
        args: done.args,
        result: done.result,
        parentId: ctx.parentId,
      }),
    runTool: (call) => specialist.runTool(ctx, call.name, call.args),
    onTextOnlyRound: (text, results) => {
      const askedInsteadOfActing = looksLikeQuestion(text) || (results.length === 0 && wantsNewLeads(task));
      if (!askedInsteadOfActing || resumedFromQuestion) return false;
      resumedFromQuestion = true;
      input.push({
        role: "user",
        content:
          "Answer yourself from the briefing above and continue the original task now. Call your tools. Do not ask Copilot or the user another question.",
      });
      return true;
    },
  });

  const toolResults: Array<{ id: string; name: string; args: Record<string, unknown>; result: unknown }> = [...loop.toolResults];
  let finalText = loop.finalText;

  // Fallbacks for a specialist that answered in text instead of doing the job.
  if (!loop.exhausted && !loop.cancelled) {
    const alreadyCreated = toolResults.some((row) => row.name === "create_sequence");
    if (specialist.id === "operator" && wantsSequenceCreated(task) && !alreadyCreated) {
      const callId = `auto-sequence-${Date.now()}`;
      ctx.emit?.({ type: "tool_start", id: callId, name: "create_sequence", agent: specialist.id, args: {}, parentId: ctx.parentId });
      let result: unknown;
      try {
        result = await createSequenceFromBlueprint(ctx);
      } catch (err) {
        result = { error: err instanceof Error ? err.message : "Could not create the sequence" };
      }
      ctx.emit?.({ type: "tool_end", id: callId, name: "create_sequence", agent: specialist.id, args: {}, result, parentId: ctx.parentId });
      toolResults.push({ id: callId, name: "create_sequence", args: {}, result });
      const created = result && typeof result === "object" ? (result as Record<string, unknown>) : {};
      finalText =
        typeof created.name === "string"
          ? `Created “${created.name}” from the approved blueprint. The campaign card is in the chat.`
          : typeof created.error === "string"
            ? created.error
            : "Could not create the sequence.";
    }
  }

  const payload = {
    agent: specialist.id,
    task,
    confirmed,
    summary: finalText || "Done.",
    reasoning: reasoning.trim() || undefined,
    tools: toolResults,
  };
  return {
    ...payload,
    needsLeads: specialist.id !== "researcher" && resultNeedsLeads(payload),
  };
}
