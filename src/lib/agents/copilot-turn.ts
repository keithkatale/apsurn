/**
 * One Copilot turn: load the conversation, run the agent loop, persist every
 * round. Shared by the streaming chat route (user messages) and the background
 * job (run finished, plan approved), so a turn behaves the same wherever it
 * runs. `send` is optional — headless turns persist and the client polls.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResponseInputItem } from "openai/resources/responses/responses";
import { getAiClient, toFunctionTool } from "@/lib/ai/openai";
import { COPILOT_SYSTEM_INSTRUCTION, COPILOT_TOOL_DECLARATIONS, runCopilotTool } from "@/lib/copilot/tools";
import { COPILOT_MUTATING_TOOLS } from "./copilot";
import { runAgentLoop } from "./loop";
import { toolPhase } from "./labels";
import { resultError } from "./run-events";
import type { RunSink } from "./run-sink";
import type { AgentToolContext, CopilotArtifact } from "./types";
import { generateCommercialLeadsTool, runSignalRadarTool } from "./source-leads";

export const CHAT_TURN_ROUNDS = 4;
/** Plan continuations still get a few steps, not an open-ended research loop. */
export const BACKGROUND_TURN_ROUNDS = 6;
const HISTORY_ROWS = 16;

interface MessageRow {
  role: "user" | "model" | "tool";
  content: string;
  tool_name: string | null;
  tool_call_id: string | null;
  metadata: Record<string, unknown>;
}

/** Prior user and assistant text only. Tool transcripts stay on screen and are not sent back, so a new message is not a continuation of an old search. */
export function buildResponsesInput(rows: MessageRow[]): ResponseInputItem[] {
  const input: ResponseInputItem[] = [];
  for (const row of rows) {
    if (row.role === "user") input.push({ role: "user", content: row.content });
    else if (row.role === "model" && row.content) input.push({ role: "assistant", content: row.content });
  }
  return input;
}

export interface RunCopilotTurnOptions {
  db: SupabaseClient;
  userId: string;
  conversationId: string;
  /** Where progress goes. The chat follows it live and replays it after a reload. */
  sink?: RunSink;
  isCancelled?: () => boolean;
  maxRounds?: number;
  deadlineAt?: number;
  /** The approved plan this turn executes, for budget accounting. */
  taskId?: string;
}

export interface CopilotTurnResult {
  finalText: string;
  artifacts: CopilotArtifact[];
  /** Every round ended in tool calls: the model never finished. */
  exhausted: boolean;
  cancelled: boolean;
}

type ToolRow = {
  conversation_id: string;
  role: "tool";
  tool_name: string;
  tool_call_id: string;
  content: string;
  metadata: { args: Record<string, unknown>; callId: string; thoughtSignature?: string };
};

export function isLeadDiscoveryQuery(userMsg: string): { isLead: boolean; isCommercial: boolean } {
  const isCommercial =
    /\b(commercial|real\s*estate|contractor|property|permit|building\s*permit|land\s*buyer)\b/i.test(userMsg) &&
    /\b(lead|leads|prospect|prospects|find|generate|source)\b/i.test(userMsg);

  const isLead =
    isCommercial ||
    /\b(find|source|generate|get|give|show|look for|discover|search for|pull|fetch|scan for)\b.*\b(leads?|prospects?|companies|buyers|startups|icp)\b/i.test(userMsg) ||
    /\b(leads?|prospects?|companies)\b.*\b(icp|match|find|source|generate|show|give)\b/i.test(userMsg) ||
    /\b(lead\s*generation|prospecting|signal\s*radar)\b/i.test(userMsg) ||
    /find.*leads/i.test(userMsg);

  return { isLead, isCommercial };
}

export function hasMarkdownTable(text: string): boolean {
  return /\|(?:\s*[:-]+[-| :]*\s*)\|/.test(text) || (/\|.*\|/.test(text) && /\|[- :]+\|/.test(text));
}

export function formatLeadTableToMarkdown(artifact: CopilotArtifact): string {
  const payload = artifact.payload as Record<string, unknown> | undefined;
  if (!payload) return "";
  let rows: Array<Record<string, unknown>> = [];
  if (Array.isArray(payload.rows)) {
    rows = payload.rows as Array<Record<string, unknown>>;
  } else if (Array.isArray(payload.blocks)) {
    const tableBlock = (payload.blocks as Array<{ type?: string; rows?: unknown[] }>).find((b) => b.type === "table");
    if (tableBlock && Array.isArray(tableBlock.rows)) {
      rows = tableBlock.rows as Array<Record<string, unknown>>;
    }
  }
  if (rows.length === 0) return "";

  const isCommercial = rows.some((r) => r.phone || r.location);
  if (isCommercial) {
    let md = "\n\n| Company | Location | Contact / Title | Phone / Email | Lead Type / Signal |\n";
    md += "| :--- | :--- | :--- | :--- | :--- |\n";
    for (const r of rows.slice(0, 50)) {
      const company = String(r.companyName || r.company || "Unknown");
      const location = String(r.location || "-");
      const contact = [r.fullName || r.name, r.title].filter(Boolean).join(" - ") || "-";
      const contactInfo = [r.phone, r.email].filter(Boolean).join(" / ") || "-";
      const signal = String(r.description || r.signal || r.source || "-");
      md += `| **${company}** | ${location} | ${contact} | ${contactInfo} | ${signal} |\n`;
    }
    if (rows.length > 50) {
      md += `\n*Showing top 50 of ${rows.length} discovered prospects. View all in the interactive table card above.*`;
    }
    return md;
  }

  let md = "\n\n| Company | Domain | Contact / Role | Source / Intent | Signal Reason |\n";
  md += "| :--- | :--- | :--- | :--- | :--- |\n";
  for (const r of rows.slice(0, 50)) {
    const company = String(r.companyName || r.company || "Unknown");
    const domain = r.domain ? `[${r.domain}](https://${r.domain})` : "-";
    const contact = [r.fullName || r.name, r.title].filter(Boolean).join(" - ") || "Founder / Team";
    const source = String(r.source || "Organic Signal");
    const reason = String(r.description || r.reason || r.signal || "High intent match");
    md += `| **${company}** | ${domain} | ${contact} | ${source} | ${reason} |\n`;
  }
  if (rows.length > 50) {
    md += `\n*Showing top 50 of ${rows.length} discovered prospects. View all in the interactive table card above.*`;
  }
  return md;
}

export async function runCopilotTurn(options: RunCopilotTurnOptions): Promise<CopilotTurnResult> {
  const { db, userId, conversationId, taskId, deadlineAt, sink } = options;
  const cancelled = () => Boolean(options.isCancelled?.() || sink?.isCancelled());

  // History and the AI client in parallel — neither depends on the other.
  const [{ data: historyDesc }, { ai, model }] = await Promise.all([
    db
      .from("copilot_messages")
      .select("role, content, tool_name, tool_call_id, metadata")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_ROWS),
    getAiClient(),
  ]);
  const input = buildResponsesInput(((historyDesc ?? []) as MessageRow[]).reverse());
  const turnArtifacts: CopilotArtifact[] = [];

  // Proactive lead pre-dispatch: If the user is asking to find or source leads/prospects,
  // immediately run the discovery tool so initial prospects and the live scanning card
  // appear right away, and pass the discovered leads to the model so it never hallucinates.
  const lastItem = input[input.length - 1];
  const isLatestUserMessage = Boolean(lastItem && (lastItem as { role?: string }).role === "user");
  const userMsg = isLatestUserMessage && typeof (lastItem as { content?: string })?.content === "string" ? (lastItem as { content: string }).content : "";
  const { isLead, isCommercial } = isLeadDiscoveryQuery(userMsg);

  if (isLatestUserMessage && isLead) {
    const callId = `lead_scan_${Date.now()}`;
    const toolName = isCommercial ? "generate_commercial_leads" : "run_signal_radar";
    const toolArgs: Record<string, unknown> = isCommercial ? { leadType: "all", limit: 100 } : { limit: 100 };

    sink?.toolStart(callId, toolName, toolArgs);
    sink?.status(isCommercial ? "Generating commercial leads..." : "Scanning organic signals for matching leads...");

    const toolCtx: AgentToolContext = {
      db,
      userId,
      conversationId,
      parentId: callId,
      taskId,
      deadlineAt,
      isCancelled: cancelled,
      progress: (patch) => sink?.toolProgress(callId, patch),
      emit: (event) => {
        if (event.type === "artifact" && event.artifact) {
          turnArtifacts.push(event.artifact);
          sink?.artifact(event.artifact as unknown as Record<string, unknown>);
        }
      },
    };

    let result: unknown;
    try {
      if (isCommercial) {
        result = await generateCommercialLeadsTool(toolCtx, { leadType: "all", limit: 100 });
      } else {
        result = await runSignalRadarTool(toolCtx, { limit: 100 });
      }
      sink?.toolEnd(callId, { ok: true, result });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Lead scan failed";
      result = { error: errorMsg };
      sink?.toolEnd(callId, { ok: false, error: errorMsg });
    }

    input.push({
      type: "function_call",
      call_id: callId,
      name: toolName,
      arguments: JSON.stringify(toolArgs),
    } as ResponseInputItem);

    input.push({
      type: "function_call_output",
      call_id: callId,
      output: JSON.stringify(result),
    });

    await db.from("copilot_messages").insert({
      conversation_id: conversationId,
      role: "tool",
      tool_name: toolName,
      tool_call_id: callId,
      content: JSON.stringify(result).slice(0, 20000),
      metadata: { args: toolArgs, callId },
    });
  }

  const loop = await runAgentLoop({
    ai,
    model,
    instructions: COPILOT_SYSTEM_INSTRUCTION,
    tools: COPILOT_TOOL_DECLARATIONS.map(toFunctionTool),
    input,
    maxRounds: options.maxRounds ?? CHAT_TURN_ROUNDS,
    deadlineAt,
    // Web search retries once and can take most of a minute; leave room for that.
    toolTimeoutMs: 120_000,
    // Thinking (even MINIMAL) adds ~10s on Flash-Lite. Chat stays off so greetings stay near 1s.
    thinkingBudget: 0,
    isCancelled: cancelled,
    isParallelSafe: (name) => !COPILOT_MUTATING_TOOLS.has(name),
    // No "Thinking…" / "Working…" status spam — only label real tool work.
    onText: (delta) => sink?.text(delta),
    onThought: (delta) => sink?.reasoning(delta),
    onToolStart: (call) => {
      sink?.toolStart(call.id, call.name, call.args);
      sink?.status(toolPhase(call.name, call.args));
    },
    onToolEnd: (done) => {
      const error = resultError(done.result);
      sink?.toolEnd(done.id, { ok: !error, result: done.result, error: error ?? undefined });
    },
    runTool: (call, signal) =>
      runCopilotTool(
        {
          db,
          userId,
          conversationId,
          parentId: call.id,
          taskId,
          deadlineAt,
          isCancelled: cancelled,
          signal,
          progress: (patch) => sink?.toolProgress(call.id, patch),
          emit: (event) => {
            if (event.type === "artifact" && event.artifact) {
              turnArtifacts.push(event.artifact);
              sink?.artifact(event.artifact as unknown as Record<string, unknown>);
            }
          },
        },
        call.name,
        call.args,
      ),
    onRoundEnd: async (results) => {
      const toolRows: ToolRow[] = results.map((done) => ({
        conversation_id: conversationId,
        role: "tool",
        tool_name: done.name,
        tool_call_id: done.id,
        content: JSON.stringify(done.result).slice(0, 20000),
        metadata: { args: done.args, callId: done.id, ...(done.thoughtSignature ? { thoughtSignature: done.thoughtSignature } : {}) },
      }));
      if (toolRows.length > 0) await db.from("copilot_messages").insert(toolRows);
    },
    onTextOnlyRound: async (roundText, toolResults) => {
      if (turnArtifacts.length > 0) return false;
      if (toolResults.length === 0) {
        const lastUser = input.slice().reverse().find((item) => (item as { role?: string }).role === "user");
        const queryMsg = typeof (lastUser as { content?: string })?.content === "string" ? (lastUser as { content: string }).content : "";
        const queryCheck = isLeadDiscoveryQuery(queryMsg);

        if (queryCheck.isLead && !hasMarkdownTable(roundText)) {
          input.push({
            role: "user",
            content: "Correction: You must call run_signal_radar with { limit: 100 } to search for leads. Do not reply with text until you have called run_signal_radar.",
          });
          return true;
        }
      }
      return false;
    },
  });

  let finalText = loop.finalText;

  // Safety net 1: If leads were sourced into artifacts, guarantee the Markdown table is in the chat text!
  let leadArtifact = turnArtifacts.find((a) => a.kind === "lead_table" || (a.payload as { rows?: unknown[] })?.rows);
  if (leadArtifact && !hasMarkdownTable(finalText)) {
    const tableMd = formatLeadTableToMarkdown(leadArtifact);
    if (tableMd) {
      if (/in the table above/i.test(finalText)) {
        finalText = finalText.replace(/in the table above/gi, "in the table below (and interactive card above)");
      }
      finalText = `${finalText.trim()}${tableMd}`;
      sink?.text(tableMd);
    }
  }

  // Safety net 2: If the model still hallucinated having scanned/found leads without calling any tool
  if (
    turnArtifacts.length === 0 &&
    (/table above/i.test(finalText) ||
      /(view|see).*(in the table|above)/i.test(finalText) ||
      /(found|scanned|discovered|sourced).*\b(\d+|several|relevant|matching)?\s*(leads?|prospects?|companies)\b/i.test(finalText))
  ) {
    const fallbackCallId = `fallback_${Date.now()}`;
    sink?.toolStart(fallbackCallId, "run_signal_radar", { limit: 100 });
    sink?.status("Scanning organic signals for matching leads...");

    const fallbackCtx: AgentToolContext = {
      db,
      userId,
      conversationId,
      parentId: fallbackCallId,
      taskId,
      deadlineAt,
      isCancelled: cancelled,
      progress: (patch) => sink?.toolProgress(fallbackCallId, patch),
      emit: (event) => {
        if (event.type === "artifact" && event.artifact) {
          turnArtifacts.push(event.artifact);
          sink?.artifact(event.artifact as unknown as Record<string, unknown>);
        }
      },
    };

    try {
      const result = await runSignalRadarTool(fallbackCtx, { limit: 100 });
      sink?.toolEnd(fallbackCallId, { ok: true, result });
      leadArtifact = turnArtifacts.find((a) => a.kind === "lead_table" || (a.payload as { rows?: unknown[] })?.rows);
      if (leadArtifact && !hasMarkdownTable(finalText)) {
        const tableMd = formatLeadTableToMarkdown(leadArtifact);
        if (tableMd) {
          if (/in the table above/i.test(finalText)) {
            finalText = finalText.replace(/in the table above/gi, "in the table below (and interactive card above)");
          }
          finalText = `${finalText.trim()}${tableMd}`;
          sink?.text(tableMd);
        }
      }
    } catch (err) {
      sink?.toolEnd(fallbackCallId, { ok: false, error: err instanceof Error ? err.message : "Fallback scan failed" });
    }
  }

  if (!finalText.trim() && !loop.cancelled) {
    const fallback = leadArtifact
      ? "Here are the high-intent prospects discovered matching your ICP:"
      : (turnArtifacts.length > 0 ? "Done — here are the results:" : "");
    if (fallback) {
      const tableMd = leadArtifact ? formatLeadTableToMarkdown(leadArtifact) : "";
      finalText = `${fallback}${tableMd}`;
      sink?.text(finalText);
    }
  }

  const timeline = sink?.timeline() ?? [];
  if (finalText.trim() || turnArtifacts.length > 0 || timeline.length > 0) {
    await db.from("copilot_messages").insert({
      conversation_id: conversationId,
      role: "model",
      content: finalText,
      metadata: { artifactIds: turnArtifacts.map((artifact) => artifact.id), ...(timeline.length > 0 ? { timeline, runId: sink?.runId } : {}) },
    });
  }
  await db.from("copilot_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);

  return { finalText, artifacts: turnArtifacts, exhausted: loop.exhausted, cancelled: loop.cancelled };
}
