"use client";

import { useEffect, useRef, useState } from "react";
import type { RunEvent } from "@/lib/agents/run-events";
import { emptyRun, reduceRun, type RunState } from "@/lib/agents/timeline";

interface Frame {
  seq?: number;
  event?: RunEvent;
  end?: boolean;
  status?: string;
  error?: string | null;
}

const RECONNECT_MS = 1000;

/**
 * Follows one run: opens its event stream, replays events through the timeline reducer, and reconnects from the last
 * sequence if the connection drops (a reload, a sleeping laptop, a proxy timeout). The run itself lives on the server
 * and does not depend on this connection, so reconnecting always picks up where the chat left off.
 */
export function useRunStream(runId: string | null, onFinished?: (state: RunState) => void, seed?: RunState | null): RunState {
  const [state, setState] = useState<RunState>(() => seed ?? emptyRun());
  const seedRef = useRef(seed);
  seedRef.current = seed;
  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;

  useEffect(() => {
    if (!runId) return;
    const controller = new AbortController();
    // A saved snapshot (from the page load or the last visit) paints at once; only newer events are fetched.
    let current = seedRef.current && seedRef.current.lastSeq > 0 ? seedRef.current : emptyRun();
    let after = current.lastSeq;
    let frameRequest = 0;

    const publish = () => {
      // Many events can land in one read; draw once per frame.
      if (frameRequest) return;
      frameRequest = window.requestAnimationFrame(() => {
        frameRequest = 0;
        setState(current);
      });
    };

    function terminal(): boolean {
      return current.status !== "running";
    }

    async function follow() {
      setState(current);
      while (!controller.signal.aborted && !terminal()) {
        try {
          const res = await fetch(`/api/copilot/runs/${runId}/events?after=${after}`, { signal: controller.signal });
          if (res.status === 404 || res.status === 401) {
            current = { ...current, status: "error", error: "This run could not be found." };
            break;
          }
          if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split("\n\n");
            buffer = parts.pop() ?? "";
            for (const part of parts) {
              const line = part.split("\n").find((entry) => entry.startsWith("data:"));
              if (!line) continue;
              const frame = JSON.parse(line.slice(5).trim()) as Frame;
              if (frame.event && typeof frame.seq === "number") {
                current = reduceRun(current, frame.seq, frame.event);
                after = Math.max(after, frame.seq);
              } else if (frame.end && current.status === "running") {
                current = { ...current, status: frame.status === "error" ? "error" : frame.status === "cancelled" ? "cancelled" : "done", error: frame.error ?? current.error };
              }
            }
            publish();
          }
        } catch {
          if (controller.signal.aborted) return;
        }
        if (!terminal() && !controller.signal.aborted) await new Promise((resolve) => setTimeout(resolve, RECONNECT_MS));
      }
      if (controller.signal.aborted) return;
      if (frameRequest) window.cancelAnimationFrame(frameRequest);
      setState(current);
      finishedRef.current?.(current);
    }

    void follow();
    return () => {
      controller.abort();
      if (frameRequest) window.cancelAnimationFrame(frameRequest);
    };
  }, [runId]);

  return state;
}
