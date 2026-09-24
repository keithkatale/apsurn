import type { ResponseFunctionToolCall, ResponseInputItem, ResponseOutputItem } from "openai/resources/responses/responses";
import { getAiClient, toFunctionTool } from "@/lib/ai/openai";
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
      ? `${task}\n\nStart a prospecting run from the approved blueprint now. Call start_prospecting_run. Do not ask for industries, geographies, or personas.`
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

  let finalText = "";
  let reasoning = "";
  let resumedFromQuestion = false;
  const toolResults: Array<{ id: string; name: string; args: Record<string, unknown>; result: unknown }> = [];

  for (let round = 0; round < MAX_SPECIALIST_ROUNDS; round++) {
    let roundText = "";
    let outputItems: ResponseOutputItem[] = [];
    const responseStream = await ai.responses.create({
      model,
      input,
      instructions: specialist.instruction,
      tools,
      stream: true,
    });

    for await (const event of responseStream) {
      const type = event.type as string;
      if (type === "response.output_text.delta") {
        roundText += event.delta;
        reasoning += event.delta;
        ctx.emit?.({
          type: "reasoning",
          name: specialist.id,
          agent: specialist.id,
          text: event.delta,
          parentId: ctx.parentId,
        });
      } else if (type === "response.reasoning_summary_text.delta" || type === "response.reasoning.delta") {
        const delta = "delta" in event && typeof event.delta === "string" ? event.delta : "";
        if (delta) {
          reasoning += delta;
          ctx.emit?.({
            type: "reasoning",
            name: specialist.id,
            agent: specialist.id,
            text: delta,
            parentId: ctx.parentId,
          });
        }
      } else if (type === "response.completed") {
        outputItems = event.response.output;
      } else if (type === "error") {
        throw new Error(event.message);
      }
    }

    for (const item of outputItems) input.push(item as ResponseInputItem);
    const calls = outputItems.filter((item): item is ResponseFunctionToolCall => item.type === "function_call");
    if (calls.length === 0) {
      const askedInsteadOfActing = looksLikeQuestion(roundText) || (toolResults.length === 0 && wantsNewLeads(task));
      if (askedInsteadOfActing && !resumedFromQuestion) {
        resumedFromQuestion = true;
        input.push({
          role: "user",
          content:
            "Answer yourself from the briefing above and continue the original task now. Call your tools. Do not ask Copilot or the user another question.",
        });
        continue;
      }

      const alreadyCreated = toolResults.some((row) => row.name === "create_sequence");
      if (specialist.id === "operator" && wantsSequenceCreated(task) && !alreadyCreated) {
        const callId = `auto-sequence-${Date.now()}`;
        ctx.emit?.({
          type: "tool_start",
          id: callId,
          name: "create_sequence",
          agent: specialist.id,
          args: {},
          parentId: ctx.parentId,
        });
        let result: unknown;
        try {
          result = await createSequenceFromBlueprint(ctx);
        } catch (err) {
          result = { error: err instanceof Error ? err.message : "Could not create the sequence" };
        }
        ctx.emit?.({
          type: "tool_end",
          id: callId,
          name: "create_sequence",
          agent: specialist.id,
          args: {},
          result,
          parentId: ctx.parentId,
        });
        toolResults.push({ id: callId, name: "create_sequence", args: {}, result });
        const created = result && typeof result === "object" ? (result as Record<string, unknown>) : {};
        finalText =
          typeof created.name === "string"
            ? `Created “${created.name}” from the approved blueprint. The campaign card is in the chat.`
            : typeof created.error === "string"
              ? created.error
              : "Could not create the sequence.";
        break;
      }

      const alreadyStarted = toolResults.some((row) => row.name === "start_prospecting_run");
      if (specialist.id === "researcher" && wantsNewLeads(task) && !alreadyStarted) {
        const callId = `auto-start-${Date.now()}`;
        const toolArgs = {};
        ctx.emit?.({
          type: "tool_start",
          id: callId,
          name: "start_prospecting_run",
          agent: specialist.id,
          args: toolArgs,
          parentId: ctx.parentId,
        });
        let result: unknown;
        try {
          result = await specialist.runTool(ctx, "start_prospecting_run", toolArgs);
        } catch (err) {
          result = { error: err instanceof Error ? err.message : "Tool failed" };
        }
        ctx.emit?.({
          type: "tool_end",
          id: callId,
          name: "start_prospecting_run",
          agent: specialist.id,
          args: toolArgs,
          result,
          parentId: ctx.parentId,
        });
        toolResults.push({ id: callId, name: "start_prospecting_run", args: toolArgs, result });
        const started = result && typeof result === "object" ? (result as Record<string, unknown>) : {};
        if (started.queued) {
          const criteria = started.criteria && typeof started.criteria === "object" ? (started.criteria as Record<string, unknown>) : {};
          const industries = Array.isArray(criteria.industries) ? criteria.industries.join(", ") : "";
          finalText = `Started a prospecting run for ${started.limit ?? "your"} companies using the approved blueprint${industries ? ` (${industries})` : ""}.`;
        } else {
          finalText = typeof started.error === "string" ? started.error : roundText || "Could not start a prospecting run.";
        }
        break;
      }

      finalText = roundText;
      break;
    }

    for (const call of calls) {
      const toolArgs = JSON.parse(call.arguments || "{}") as Record<string, unknown>;
      if (confirmed && (call.name === "run_send_pass" || call.name === "send_email_now") && toolArgs.confirmed !== true) {
        toolArgs.confirmed = true;
      }
      ctx.emit?.({
        type: "tool_start",
        id: call.call_id,
        name: call.name,
        agent: specialist.id,
        args: toolArgs,
        parentId: ctx.parentId,
      });
      let result: unknown;
      try {
        result = await specialist.runTool(ctx, call.name, toolArgs);
      } catch (err) {
        result = { error: err instanceof Error ? err.message : "Tool failed" };
      }
      ctx.emit?.({
        type: "tool_end",
        id: call.call_id,
        name: call.name,
        agent: specialist.id,
        args: toolArgs,
        result,
        parentId: ctx.parentId,
      });
      toolResults.push({ id: call.call_id, name: call.name, args: toolArgs, result });
      input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result) });
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
