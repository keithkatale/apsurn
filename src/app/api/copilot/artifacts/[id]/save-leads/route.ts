import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { saveSourcedLeads } from "@/lib/agents/source-leads";

const bodySchema = z.object({
  rowIds: z.array(z.string().min(1)).min(1).max(100),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Select at least one lead." }, { status: 400 });
  const result = await saveSourcedLeads({ db: createAdminClient(), userId }, id, parsed.data.rowIds);
  const status = "error" in result && result.error && !("saved" in result && result.saved) ? 400 : 200;
  return NextResponse.json(result, { status });
}
