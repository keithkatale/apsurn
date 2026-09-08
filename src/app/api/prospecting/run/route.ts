import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { inngest } from "@/lib/inngest/client";

const requestSchema = z.object({
  version: z.literal(1).default(1),
  listName: z.string().trim().min(1).max(120),
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

export async function POST(request: NextRequest) {
  let userId: string;
  try { userId = await getCurrentUserId(); } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid prospecting request", issues: parsed.error.issues }, { status: 400 });
  const db = createAdminClient();
  const { data: company } = await db.from("companies").select("id,company_blueprints!inner(approved_at)").eq("user_id", userId).not("company_blueprints.approved_at", "is", null).maybeSingle();
  if (!company) return NextResponse.json({ error: "Build and approve your company blueprint first" }, { status: 400 });

  // A process restart between inserting a run and publishing its event can
  // leave a row queued forever. Retire only old runs that never began; active
  // discovery/enrichment runs are owned by Inngest and are left untouched.
  const staleBefore = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: staleRuns } = await db
    .from("prospecting_runs")
    .select("id,list_id")
    .eq("user_id", userId)
    .eq("status", "queued")
    .lt("created_at", staleBefore);
  if (staleRuns?.length) {
    const staleRunIds = staleRuns.map((run) => run.id);
    const staleListIds = staleRuns.map((run) => run.list_id);
    const staleMessage = "This run was queued before the background worker was available. Run the search again.";
    await Promise.all([
      db.from("prospecting_runs").update({ status: "failed", stage: "failed", error_summary: staleMessage, completed_at: new Date().toISOString() }).in("id", staleRunIds),
      db.from("prospect_lists").update({ status: "failed", error: staleMessage, completed_at: new Date().toISOString() }).in("id", staleListIds),
    ]);
  }
  const { count } = await db.from("prospecting_runs").select("id", { count: "exact", head: true }).eq("user_id", userId).in("status", ["queued", "discovering", "enriching", "verifying"]);
  if ((count ?? 0) >= 2) return NextResponse.json({ error: "Two prospecting runs are already active" }, { status: 429 });
  const { data: list, error: listError } = await db.from("prospect_lists").insert({ user_id: userId, company_id: company.id, name: parsed.data.listName, criteria: parsed.data.criteria, status: "queued", requested_count: parsed.data.limit }).select().single();
  if (listError || !list) return NextResponse.json({ error: listError?.message ?? "Failed to create list" }, { status: 500 });
  const { data: run, error: runError } = await db.from("prospecting_runs").insert({ list_id: list.id, user_id: userId, status: "queued", target_count: parsed.data.limit }).select().single();
  if (runError || !run) return NextResponse.json({ error: runError?.message ?? "Failed to create run" }, { status: 500 });
  try {
    await inngest.send({ name: "prospecting/run.requested", data: { runId: run.id, listId: list.id } });
  } catch (error) {
    const message = process.env.NODE_ENV === "development"
      ? "Could not reach the Inngest Dev Server. Start it with `npm run inngest:dev`."
      : "Could not enqueue prospecting. Check INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY.";
    await Promise.all([
      db.from("prospecting_runs").update({ status: "failed", stage: "failed", error_summary: message, completed_at: new Date().toISOString() }).eq("id", run.id),
      db.from("prospect_lists").update({ status: "failed", error: message, completed_at: new Date().toISOString() }).eq("id", list.id),
    ]);
    console.error(`[prospecting] enqueue failed: ${error instanceof Error ? error.message.slice(0, 200) : "unknown error"}`);
    return NextResponse.json({ error: message, listId: list.id, runId: run.id }, { status: 503 });
  }
  return NextResponse.json({ listId: list.id, runId: run.id, status: "queued" }, { status: 202 });
}
