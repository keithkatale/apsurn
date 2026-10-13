/**
 * The chat's timeline: reasoning, narration, tool calls and cards in the order they happened. Built by replaying run
 * events through reduceRun, on the server (to save the finished run with the message) and in the browser (to draw it
 * live). Pure, no imports, so it runs under node:test.
 */
import type { RunEvent, RunStatus } from "./run-events.ts";

export type ToolStatus = "running" | "done" | "failed";

export interface ToolItem {
  kind: "tool";
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: ToolStatus;
  startedAt: number;
  ms?: number;
  /** Partial output reported while the tool ran (for example the URL being read). */
  progress: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

export type TimelineItem =
  | { kind: "reasoning"; id: string; text: string }
  | { kind: "text"; id: string; text: string }
  | ToolItem
  | { kind: "artifact"; id: string; artifact: Record<string, unknown> };

export interface RunState {
  items: TimelineItem[];
  status: RunStatus;
  /** What the run is doing right now, for the live status line. */
  label: string;
  error: string | null;
  /** Highest event sequence applied. Replays of lower sequences are ignored. */
  lastSeq: number;
}

export function emptyRun(): RunState {
  return { items: [], status: "running", label: "", error: null, lastSeq: 0 };
}

function lastOf(items: TimelineItem[]): TimelineItem | undefined {
  return items[items.length - 1];
}

/** Apply one event to a list of items. Returns a new list. */
export function applyEvent(items: TimelineItem[], event: RunEvent): TimelineItem[] {
  switch (event.type) {
    case "reasoning": {
      if (!event.text) return items;
      const last = lastOf(items);
      if (last?.kind === "reasoning") return [...items.slice(0, -1), { ...last, text: last.text + event.text }];
      return [...items, { kind: "reasoning", id: `r${items.length}`, text: event.text }];
    }
    case "text": {
      if (!event.text) return items;
      const last = lastOf(items);
      if (last?.kind === "text") return [...items.slice(0, -1), { ...last, text: last.text + event.text }];
      return [...items, { kind: "text", id: `t${items.length}`, text: event.text }];
    }
    case "tool_start": {
      if (items.some((item) => item.kind === "tool" && item.id === event.id)) return items;
      return [...items, { kind: "tool", id: event.id, name: event.name, args: event.args, status: "running", startedAt: event.at, progress: {} }];
    }
    case "tool_progress":
      return items.map((item) => (item.kind === "tool" && item.id === event.id ? { ...item, progress: { ...item.progress, ...event.patch } } : item));
    case "tool_end":
      return items.map((item) =>
        item.kind === "tool" && item.id === event.id
          ? { ...item, status: event.ok ? "done" : "failed", result: event.result, error: event.ok ? undefined : (event.error ?? "The tool failed."), ms: event.ms }
          : item,
      );
    case "artifact": {
      const id = typeof event.artifact.id === "string" ? event.artifact.id : `a${items.length}`;
      if (items.some((item) => item.kind === "artifact" && item.id === id)) return items;
      return [...items, { kind: "artifact", id, artifact: event.artifact }];
    }
    default:
      return items;
  }
}

/** Apply one stored event to the run state. A sequence at or below lastSeq is a replay and changes nothing. */
export function reduceRun(state: RunState, seq: number, event: RunEvent): RunState {
  if (seq <= state.lastSeq) return state;
  const next: RunState = { ...state, lastSeq: seq, items: applyEvent(state.items, event) };
  switch (event.type) {
    case "status":
      next.label = event.label;
      break;
    case "tool_start":
    case "tool_end":
    case "reasoning":
    case "text":
      // A stale phase label would contradict what is on screen now.
      next.label = event.type === "tool_start" ? "" : next.label;
      break;
    case "error":
      next.status = "error";
      next.error = event.message;
      break;
    case "cancelled":
      next.status = "cancelled";
      break;
    case "done":
      next.status = "done";
      break;
  }
  return next;
}

/** A run that stopped early leaves tools "running" forever unless they are closed out. */
export function settleTimeline(items: TimelineItem[], reason: string): TimelineItem[] {
  return items.map((item) => (item.kind === "tool" && item.status === "running" ? { ...item, status: "failed", error: reason } : item));
}

const MAX_RESULT_CHARS = 6000;

/** Keeps what the UI shows (urls, titles, verdicts) and drops bulk (page text) so a saved timeline stays small. */
export function compactResult(result: unknown): unknown {
  if (!result || typeof result !== "object") return result;
  const copy: Record<string, unknown> = { ...(result as Record<string, unknown>) };
  if (typeof copy.text === "string" && copy.text.length > 600) {
    copy.excerpt = copy.text.slice(0, 600);
    copy.textChars = (copy.text as string).length;
    delete copy.text;
  }
  if (Array.isArray(copy.links)) copy.links = copy.links.slice(0, 10);
  let json = "";
  try {
    json = JSON.stringify(copy);
  } catch {
    return { note: "result not stored" };
  }
  return json.length > MAX_RESULT_CHARS ? { note: "Large result, not stored.", ok: copy.ok, error: copy.error } : copy;
}

/** The finished timeline as saved on the message: results compacted, anything still running closed out. */
export function compactTimeline(items: TimelineItem[]): TimelineItem[] {
  return items.map((item) => {
    if (item.kind === "tool") return { ...item, result: compactResult(item.result) };
    // Cards are stored in copilot_artifacts; the timeline only needs to know where each one sits.
    if (item.kind === "artifact") return { ...item, artifact: { id: item.artifact.id, kind: item.artifact.kind, title: item.artifact.title } };
    return item;
  });
}
