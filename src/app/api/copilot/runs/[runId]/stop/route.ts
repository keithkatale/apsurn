import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stop button: asks the running turn to wind down. The turn notices within a few seconds and ends as cancelled. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }
  const { runId } = await params;
  const db = createAdminClient();
  const { data } = await db
    .from("copilot_runs")
    .update({ cancel_requested: true })
    .eq("id", runId)
    .eq("user_id", userId)
    .eq("status", "running")
    .select("id")
    .maybeSingle();
  return NextResponse.json({ stopping: Boolean(data) });
}
