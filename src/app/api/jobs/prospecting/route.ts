import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cronUnauthorized, isCronAuthorized } from "@/lib/jobs/auth";
import { executeAgentProspectingRun } from "@/lib/prospecting/agent/run";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 800;

const bodySchema = z.object({
  runId: z.string().uuid(),
  listId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) return cronUnauthorized();

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { runId, listId } = parsed.data;
  try {
    const result = await executeAgentProspectingRun(runId, listId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Prospecting failed";
    const db = createAdminClient();
    await Promise.all([
      db
        .from("prospecting_runs")
        .update({ status: "failed", stage: "failed", error_summary: message, completed_at: new Date().toISOString() })
        .eq("id", runId),
      db.from("prospect_lists").update({ status: "failed", error: message }).eq("id", listId),
    ]);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
