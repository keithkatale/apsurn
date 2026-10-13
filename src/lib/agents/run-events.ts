/**
 * What a Copilot run emits while it works. The server appends these to copilot_run_events, the browser replays them
 * through applyEvent (timeline.ts) to draw the chat. Pure types, no imports, so it runs under node:test.
 */
export type RunEvent =
  /** The current phase, shown on the live status line. */
  | { type: "status"; label: string }
  /** The model's thinking, muted. */
  | { type: "reasoning"; text: string }
  /** Text the model wrote: narration between tools, and the final answer as the last text of the run. */
  | { type: "text"; text: string }
  | { type: "tool_start"; id: string; name: string; args: Record<string, unknown>; at: number }
  /** A tool reporting something while it is still running, merged into the tool's progress. */
  | { type: "tool_progress"; id: string; patch: Record<string, unknown> }
  | { type: "tool_end"; id: string; ok: boolean; result?: unknown; error?: string; ms?: number }
  /** A card (campaign, table, document, …) the user can act on. */
  | { type: "artifact"; artifact: Record<string, unknown> }
  | { type: "error"; message: string }
  | { type: "cancelled" }
  | { type: "done" };

export type RunStatus = "running" | "done" | "error" | "cancelled";

export interface StoredRunEvent {
  seq: number;
  event: RunEvent;
}

export function isTerminal(status: RunStatus): boolean {
  return status !== "running";
}

/** A tool result that carries an error string did not work, whatever else it returned. */
export function resultError(result: unknown): string | null {
  if (result && typeof result === "object" && !Array.isArray(result)) {
    const error = (result as { error?: unknown }).error;
    if (typeof error === "string" && error.trim()) return error;
  }
  return null;
}
