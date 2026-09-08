import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";

export async function POST(_: Request, { params }: { params: Promise<{ runId: string }> }) {
  let userId: string;
  try { userId = await getCurrentUserId(); } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }
  const { runId } = await params;
  const db = createAdminClient();
  const { data: run } = await db.from("prospecting_runs").update({ status: "cancelled", stage: "cancelled", completed_at: new Date().toISOString() }).eq("id", runId).eq("user_id", userId).in("status", ["queued", "discovering", "enriching", "verifying"]).select("list_id").maybeSingle();
  if (!run) return NextResponse.json({ error: "Active run not found" }, { status: 404 });
  await db.from("prospect_lists").update({ status: "cancelled", completed_at: new Date().toISOString() }).eq("id", run.list_id);
  return NextResponse.json({ status: "cancelled" });
}
