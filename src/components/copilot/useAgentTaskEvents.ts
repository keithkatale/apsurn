"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type TaskStatus =
  | "awaiting_approval"
  | "queued"
  | "running"
  | "waiting"
  | "paused"
  | "completed"
  | "failed"
  | "cancelling"
  | "cancelled";

export interface TaskSnapshot {
  id: string;
  status: TaskStatus;
  goal: string;
  budget: number;
  spent: number;
  error: string | null;
}

export interface TaskStep {
  id: string;
  idx: number;
  title: string;
  agent: string | null;
  status: "pending" | "running" | "done" | "failed" | "skipped" | "awaiting_confirmation";
  summary: string | null;
  runId: string | null;
  estCredits: number;
  pendingTool: string | null;
  pendingArgs: Record<string, unknown> | null;
}

export interface TaskEvent {
  id: number;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

const TERMINAL: TaskStatus[] = ["completed", "failed", "cancelled"];
const MAX_EVENTS = 300;

function pollDelay(status: TaskStatus | undefined): number | null {
  if (!status || TERMINAL.includes(status)) return null;
  if (status === "running" || status === "queued" || status === "cancelling" || status === "waiting") return 1500;
  if (status === "awaiting_approval") return 3000;
  // Waiting on a prospecting run or paused for a confirmation.
  return 4000;
}

/**
 * Tails a background agent task: polls /api/agent-tasks/[id]/events with the
 * last event id it has seen, so progress resumes exactly where it left off
 * after a reload or after reopening the tab.
 */
export function useAgentTaskEvents(taskId: string | null) {
  const [task, setTask] = useState<TaskSnapshot | null>(null);
  const [steps, setSteps] = useState<TaskStep[]>([]);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const afterRef = useRef(0);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    let timer: number | undefined;

    async function poll() {
      try {
        const res = await fetch(`/api/agent-tasks/${taskId}/events?after=${afterRef.current}`);
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !data) {
          setError(data?.error ?? "Could not load task progress");
          return;
        }
        setError(null);
        setTask(data.task);
        setSteps(data.steps ?? []);
        const fresh = (data.events ?? []) as TaskEvent[];
        if (fresh.length > 0) {
          afterRef.current = fresh[fresh.length - 1].id;
          setEvents((prev) => [...prev, ...fresh].slice(-MAX_EVENTS));
        }
        const delay = pollDelay(data.task?.status);
        if (delay !== null) timer = window.setTimeout(poll, delay);
      } catch {
        if (!cancelled) timer = window.setTimeout(poll, 5000);
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [taskId, tick]);

  return { task, steps, events, error, refresh };
}
