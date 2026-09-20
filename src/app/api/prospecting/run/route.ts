import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { reserveProspectingRun } from "@/lib/prospecting/start-run";
import { runDirectoryAgent, type AgentStreamEvent } from "@/lib/prospecting/agent/run";
import type { ProspectCriteria, RunStatus } from "@/lib/prospecting/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const requestSchema = z.object({
  version: z.literal(1).default(1),
  listName: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(30).default(15),
  criteria: z.object({
    industries: z.array(z.string().trim().min(1).max(100)).max(10).default([]),
    companySizeRange: z.string().trim().max(80).optional(),
    geographies: z.array(z.string().trim().min(1).max(100)).max(10).default([]),
    personas: z.array(z.string().trim().min(1).max(120)).max(10).default([]),
    minimumConfidence: z.number().min(0).max(1).default(0.5),
    requiredContactChannels: z.array(z.enum(["email", "phone", "profile"])).default(["email"]),
  }),
});

function sseEncode(payload: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid prospecting request", issues: parsed.error.issues }, { status: 400 });

  const db = createAdminClient();
  const { data: company } = await db
    .from("companies")
    .select("id,company_blueprints!inner(approved_at)")
    .eq("user_id", userId)
    .not("company_blueprints.approved_at", "is", null)
    .maybeSingle();
  if (!company) return NextResponse.json({ error: "Build and approve your company blueprint first" }, { status: 400 });

  const listName =
    parsed.data.listName ??
    `Prospecting run — ${new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;

  const reserved = await reserveProspectingRun(db, {
    userId,
    companyId: company.id,
    listName,
    limit: parsed.data.limit,
    criteria: parsed.data.criteria,
  });
  if (!reserved.ok) return NextResponse.json({ error: reserved.error }, { status: reserved.status });

  const { listId, runId } = reserved;
  const criteria: ProspectCriteria = parsed.data.criteria;
  const targetCount = parsed.data.limit;
  const { data: blueprint } = await db
    .from("company_blueprints")
    .select("product_summary")
    .eq("company_id", company.id)
    .maybeSingle();
  const productSummary = (blueprint?.product_summary as string | undefined) ?? null;

  const progress = async (status: RunStatus, values: Record<string, unknown> = {}) => {
    await Promise.all([
      db.from("prospecting_runs").update({ status, stage: status, updated_at: new Date().toISOString(), ...values }).eq("id", runId),
      db.from("prospect_lists").update({ status, ...(values.error_summary ? { error: values.error_summary } : {}) }).eq("id", listId),
    ]);
  };

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (payload: Record<string, unknown>) => {
        if (!closed) controller.enqueue(sseEncode(payload));
      };

      // The agent can legitimately go a long time between events while it
      // fetches and renders pages. Without traffic on the socket a proxy can
      // hold the connection open indefinitely after the worker is gone,
      // leaving the browser waiting on a stream that will never produce
      // another byte — which is what "it runs forever" looked like.
      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(new TextEncoder().encode(": keepalive\n\n"));
      }, 15_000);

      try {
        send({ type: "meta", runId, listId });
        await progress("discovering", { started_at: new Date().toISOString(), target_count: targetCount });
        await progress("enriching");

        const onEvent = (event: AgentStreamEvent) => send(event as unknown as Record<string, unknown>);

        const result = await runDirectoryAgent({
          db,
          runId,
          listId,
          userId,
          listCompanyId: company.id,
          criteria,
          productSummary,
          targetCount,
          onEvent,
          abortSignal: request.signal,
        });

        if (result.cancelled) {
          await progress("cancelled", { completed_at: new Date().toISOString() });
          send({
            type: "done",
            found: result.found,
            contactCount: result.contactCount,
            warnings: result.warnings,
            stopReason: result.stopReason,
            cancelled: true,
          });
          return;
        }

        const status: RunStatus = result.warnings > 0 && result.found === 0 ? "partial" : result.found > 0 ? "completed" : "partial";
        const completedAt = new Date().toISOString();
        await progress(status, {
          processed_count: result.found,
          contact_count: result.contactCount,
          warning_count: result.warnings,
          completed_at: completedAt,
        });
        await db.from("prospect_lists").update({ found_count: result.found, completed_at: completedAt }).eq("id", listId);

        send({
          type: "done",
          found: result.found,
          contactCount: result.contactCount,
          warnings: result.warnings,
          stopReason: result.stopReason,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Prospecting failed";
        console.error("[prospecting] run failed:", message);
        await progress("failed", { error_summary: message, completed_at: new Date().toISOString() });
        send({ type: "error", error: message });
      } finally {
        clearInterval(heartbeat);
        closed = true;
        controller.close();
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
