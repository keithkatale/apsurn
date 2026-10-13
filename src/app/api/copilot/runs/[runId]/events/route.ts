import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import type { RunEvent } from "@/lib/agents/run-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A long run outlives one connection; the chat reconnects with ?after=<last seq> and carries on.
export const maxDuration = 300;

const POLL_MS = 250;
const PING_MS = 15_000;
const DEAD_AFTER_MS = 90_000;

function frame(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

/** Tails a run's event log as server-sent events, resumable from any sequence. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const { runId } = await params;
  const db = createAdminClient();
  const { data: run } = await db.from("copilot_runs").select("id, status").eq("id", runId).eq("user_id", userId).maybeSingle();
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  let after = Math.max(0, Number(request.nextUrl.searchParams.get("after")) || 0);
  let lastPing = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      request.signal.addEventListener("abort", close);

      try {
        while (!closed) {
          const { data: rows } = await db
            .from("copilot_run_events")
            .select("seq, data")
            .eq("run_id", runId)
            .gt("seq", after)
            .order("seq", { ascending: true })
            .limit(500);

          for (const row of rows ?? []) {
            controller.enqueue(frame({ seq: row.seq, event: row.data as RunEvent }));
            after = row.seq as number;
            lastPing = Date.now();
          }

          const { data: current } = await db.from("copilot_runs").select("status, error, heartbeat_at").eq("id", runId).maybeSingle();
          if (!current) break;

          if (current.status === "running" && Date.now() - new Date(current.heartbeat_at as string).getTime() > DEAD_AFTER_MS) {
            // The server working on this run went away. Say so instead of leaving the chat waiting.
            const message = "The run stopped unexpectedly. Send your message again to retry.";
            await db.from("copilot_run_events").insert({ run_id: runId, seq: after + 1, type: "error", data: { type: "error", message } });
            await db.from("copilot_runs").update({ status: "error", error: message, finished_at: new Date().toISOString() }).eq("id", runId).eq("status", "running");
            continue;
          }

          if (current.status !== "running" && (rows?.length ?? 0) === 0) {
            controller.enqueue(frame({ end: true, status: current.status, error: current.error }));
            break;
          }

          if (Date.now() - lastPing > PING_MS) {
            controller.enqueue(new TextEncoder().encode(": ping\n\n"));
            lastPing = Date.now();
          }
          if ((rows?.length ?? 0) === 0) await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        }
      } catch {
        // The client reconnects with ?after=<last seq>.
      } finally {
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
