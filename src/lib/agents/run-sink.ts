/**
 * Where a Copilot run reports progress. Events are appended to copilot_run_events (batched, in order); the chat tails
 * them, so the live view survives reloads and the run itself never depends on a browser being connected. A heartbeat
 * keeps copilot_runs fresh and picks up a Stop request.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createBatcher, type Batcher } from "./event-batcher";
import type { RunEvent, RunStatus } from "./run-events";
import { compactTimeline, emptyRun, reduceRun, settleTimeline, type RunState, type TimelineItem } from "./timeline";

const HEARTBEAT_MS = 3_000;
const MIGRATION_HINT = "Copilot runs need a database update. Run supabase/migrations/0036_copilot_runs.sql in the Supabase SQL editor, then try again.";

export interface RunSink {
  readonly runId: string;
  status(label: string): void;
  reasoning(text: string): void;
  text(text: string): void;
  toolStart(id: string, name: string, args: Record<string, unknown>): void;
  toolProgress(id: string, patch: Record<string, unknown>): void;
  toolEnd(id: string, outcome: { ok: boolean; result?: unknown; error?: string }): void;
  artifact(artifact: Record<string, unknown>): void;
  /** True once the user pressed Stop. */
  isCancelled(): boolean;
  /** The timeline so far, results compacted, for saving on the message. */
  timeline(): TimelineItem[];
  /** Stop reporting without ending the run, because another job will carry it on. */
  pause(): Promise<void>;
  /** Write the terminal event, mark the run, stop the heartbeat. */
  finish(status: Exclude<RunStatus, "running">, error?: string): Promise<void>;
}

/** Create the run row the chat will follow. Returns null if the table is missing. */
export async function createRun(db: SupabaseClient, input: { conversationId: string; userId: string }): Promise<string | null> {
  const { data, error } = await db.from("copilot_runs").insert({ conversation_id: input.conversationId, user_id: input.userId }).select("id").single();
  if (error || !data) {
    console.error("[copilot-run] could not create run:", error?.message ?? "no row", /copilot_runs/.test(error?.message ?? "") ? MIGRATION_HINT : "");
    return null;
  }
  return data.id as string;
}

export async function openRunSink(db: SupabaseClient, runId: string): Promise<RunSink> {
  // A run carried on by a later job starts from everything already reported, so its saved timeline is whole.
  const { data: earlier } = await db.from("copilot_run_events").select("seq, data").eq("run_id", runId).order("seq", { ascending: true }).limit(20000);
  let state: RunState = emptyRun();
  for (const row of earlier ?? []) state = reduceRun(state, row.seq as number, row.data as RunEvent);
  let seq = state.lastSeq;
  // Stop pressed while the run was still queued.
  const { data: row } = await db.from("copilot_runs").select("cancel_requested").eq("id", runId).maybeSingle();
  let cancelled = Boolean(row?.cancel_requested);
  let finished = false;
  const startedAt = new Map<string, number>();

  const batcher: Batcher = createBatcher({
    write: async (events) => {
      const rows = events.map((event) => ({ run_id: runId, seq: ++seq, type: event.type, data: event }));
      const { error } = await db.from("copilot_run_events").insert(rows);
      if (error) console.error("[copilot-run] could not write events:", error.message);
    },
  });

  function emit(event: RunEvent) {
    if (finished) return;
    // The local state numbers events in the order they are pushed, the same order they are written.
    state = reduceRun(state, state.lastSeq + 1, event);
    batcher.push(event);
  }

  const heartbeat = setInterval(() => {
    void (async () => {
      const { data } = await db.from("copilot_runs").update({ heartbeat_at: new Date().toISOString() }).eq("id", runId).select("cancel_requested").maybeSingle();
      if (data?.cancel_requested) cancelled = true;
    })().catch(() => undefined);
  }, HEARTBEAT_MS);

  return {
    runId,
    status: (label) => emit({ type: "status", label }),
    reasoning: (text) => emit({ type: "reasoning", text }),
    text: (text) => emit({ type: "text", text }),
    toolStart: (id, name, args) => {
      startedAt.set(id, Date.now());
      emit({ type: "tool_start", id, name, args, at: Date.now() });
    },
    toolProgress: (id, patch) => emit({ type: "tool_progress", id, patch }),
    toolEnd: (id, outcome) => {
      const began = startedAt.get(id);
      emit({ type: "tool_end", id, ok: outcome.ok, result: outcome.result, error: outcome.error, ms: began ? Date.now() - began : undefined });
    },
    artifact: (artifact) => emit({ type: "artifact", artifact }),
    isCancelled: () => cancelled,
    async pause() {
      clearInterval(heartbeat);
      await batcher.flush();
      finished = true;
    },
    timeline: () => compactTimeline(state.items),
    async finish(status, error) {
      if (finished) return;
      clearInterval(heartbeat);
      if (status === "error") emit({ type: "error", message: error ?? "The run failed." });
      else if (status === "cancelled") emit({ type: "cancelled" });
      else emit({ type: "done" });
      await batcher.flush();
      finished = true;
      state = { ...state, items: settleTimeline(state.items, status === "cancelled" ? "Stopped." : "The run ended before this finished.") };
      await db.from("copilot_runs").update({ status, error: error ?? null, finished_at: new Date().toISOString() }).eq("id", runId);
    },
  };
}
