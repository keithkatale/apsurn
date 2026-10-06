/** Row types and small data helpers for durable agent tasks (migration 0029). */
import type { SupabaseClient } from "@supabase/supabase-js";

export type AgentTaskStatus =
  | "awaiting_approval"
  | "queued"
  | "running"
  | "waiting"
  | "paused"
  | "completed"
  | "failed"
  | "cancelling"
  | "cancelled";

export type AgentStepStatus = "pending" | "running" | "done" | "failed" | "skipped" | "awaiting_confirmation";

export const ACTIVE_TASK_STATUSES: AgentTaskStatus[] = ["queued", "running", "waiting", "paused", "cancelling"];
export const TERMINAL_TASK_STATUSES: AgentTaskStatus[] = ["completed", "failed", "cancelled"];

export interface AgentTaskRow {
  id: string;
  user_id: string;
  conversation_id: string | null;
  schedule_id: string | null;
  status: AgentTaskStatus;
  goal: string;
  plan: Record<string, unknown>;
  budget_credits: number;
  spent_credits: number;
  lease_owner: string | null;
  lease_expires_at: string | null;
  slice_count: number;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface AgentStepRow {
  id: string;
  task_id: string;
  idx: number;
  title: string;
  agent: string | null;
  instruction: string;
  tool: string | null;
  args: Record<string, unknown>;
  status: AgentStepStatus;
  attempts: number;
  est_credits: number;
  result_summary: string | null;
  output: Record<string, unknown>;
  run_id: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface AgentTaskEventRow {
  id: number;
  task_id: string;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export async function appendTaskEvent(db: SupabaseClient, taskId: string, type: string, payload: Record<string, unknown> = {}) {
  const { error } = await db.from("agent_task_events").insert({ task_id: taskId, type, payload });
  if (error) console.error("[agent-task] event insert failed", type, error.message);
}

export async function loadTask(db: SupabaseClient, taskId: string): Promise<AgentTaskRow | null> {
  const { data } = await db.from("agent_tasks").select("*").eq("id", taskId).maybeSingle();
  return (data as AgentTaskRow | null) ?? null;
}

export async function loadOwnedTask(db: SupabaseClient, userId: string, taskId: string): Promise<AgentTaskRow | null> {
  const { data } = await db.from("agent_tasks").select("*").eq("id", taskId).eq("user_id", userId).maybeSingle();
  return (data as AgentTaskRow | null) ?? null;
}

export async function loadSteps(db: SupabaseClient, taskId: string): Promise<AgentStepRow[]> {
  const { data } = await db.from("agent_task_steps").select("*").eq("task_id", taskId).order("idx", { ascending: true });
  return (data as AgentStepRow[] | null) ?? [];
}

export async function setTaskStatus(
  db: SupabaseClient,
  taskId: string,
  status: AgentTaskStatus,
  extra: Record<string, unknown> = {},
) {
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString(), ...extra };
  if (TERMINAL_TASK_STATUSES.includes(status)) {
    patch.finished_at = new Date().toISOString();
    patch.lease_owner = null;
    patch.lease_expires_at = null;
  }
  await db.from("agent_tasks").update(patch).eq("id", taskId);
  await appendTaskEvent(db, taskId, "task_status", { status, ...("error" in extra ? { error: extra.error } : {}) });
}

export async function updateStep(db: SupabaseClient, step: Pick<AgentStepRow, "id" | "task_id" | "idx">, patch: Partial<AgentStepRow>) {
  await db.from("agent_task_steps").update(patch).eq("id", step.id);
  if (patch.status) {
    await appendTaskEvent(db, step.task_id, "step_status", {
      stepId: step.id,
      idx: step.idx,
      status: patch.status,
      ...(patch.result_summary ? { summary: patch.result_summary } : {}),
    });
  }
}
