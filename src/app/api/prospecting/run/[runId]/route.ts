import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";

export async function GET(_: Request, { params }: { params: Promise<{ runId: string }> }) {
  let userId: string;
  try { userId = await getCurrentUserId(); } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }
  const { runId } = await params;
  const { data } = await createAdminClient().from("prospecting_runs").select("id,list_id,status,stage,processed_count,target_count,contact_count,warning_count,error_summary,created_at,completed_at").eq("id", runId).eq("user_id", userId).maybeSingle();
  return data ? NextResponse.json(data) : NextResponse.json({ error: "Run not found" }, { status: 404 });
}
