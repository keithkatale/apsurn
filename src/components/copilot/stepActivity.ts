import { toolLabel } from "@/lib/agents/labels";
import type { TaskEvent } from "./useAgentTaskEvents";

export type ActivityEntry =
  | { kind: "thought"; key: string; text: string }
  | { kind: "tool"; key: string; label: string; subject: string | null; status: "running" | "done" | "failed"; detail: string | null };

function subjectOf(args: unknown): string | null {
  if (!args || typeof args !== "object") return null;
  const row = args as Record<string, unknown>;
  const company = row.company && typeof row.company === "object" ? (row.company as Record<string, unknown>).name : null;
  const pick = [row.domain, company, row.fullName, row.query].find((value) => typeof value === "string" && value.trim());
  return typeof pick === "string" ? pick : null;
}

function detailOf(result: unknown): { failed: boolean; text: string | null } {
  if (!result || typeof result !== "object") return { failed: false, text: null };
  const row = result as Record<string, unknown>;
  if (typeof row.error === "string") return { failed: true, text: row.error };
  if (typeof row.summary === "string" && row.summary.trim()) return { failed: false, text: row.summary.trim() };
  if (typeof row.saved === "boolean") return { failed: false, text: row.saved ? "Saved" : typeof row.reason === "string" ? `Skipped — ${row.reason}` : "Skipped" };
  if (typeof row.email === "string") return { failed: false, text: `${row.email}${typeof row.status === "string" ? ` (${row.status})` : ""}` };
  if (row.queued === true) return { failed: false, text: "Started in the background" };
  if (typeof row.count === "number") return { failed: false, text: `${row.count} found` };
  return { failed: false, text: null };
}

/** What happened inside one plan step, in order: reasoning lines and tool calls with their outcome. */
export function stepActivity(events: TaskEvent[], stepId: string): ActivityEntry[] {
  const out: ActivityEntry[] = [];
  const toolIndex = new Map<string, number>();
  for (const event of events) {
    if (event.payload.stepId !== stepId) continue;
    const { payload } = event;
    if (event.type === "reasoning" && typeof payload.text === "string") {
      const text = payload.text.replace(/\s+/g, " ").trim();
      if (!text) continue;
      const last = out[out.length - 1];
      if (last?.kind === "thought") out[out.length - 1] = { ...last, text: `${last.text} ${text}`.slice(-400) };
      else out.push({ kind: "thought", key: `t${event.id}`, text: text.slice(-400) });
    } else if (event.type === "tool_start" && typeof payload.name === "string") {
      const id = String(payload.id ?? event.id);
      toolIndex.set(id, out.length);
      out.push({ kind: "tool", key: `s${id}`, label: toolLabel(payload.name), subject: subjectOf(payload.args), status: "running", detail: null });
    } else if (event.type === "tool_end" && typeof payload.name === "string") {
      const id = String(payload.id ?? event.id);
      const { failed, text } = detailOf(payload.result);
      const at = toolIndex.get(id);
      const entry: ActivityEntry = { kind: "tool", key: `s${id}`, label: toolLabel(payload.name), subject: subjectOf(payload.args) ?? (at !== undefined && out[at]?.kind === "tool" ? (out[at] as { subject: string | null }).subject : null), status: failed ? "failed" : "done", detail: text };
      if (at !== undefined) out[at] = entry;
      else out.push(entry);
    }
  }
  return out;
}
