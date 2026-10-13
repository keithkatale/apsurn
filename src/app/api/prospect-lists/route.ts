import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";

const createSchema = z.object({ name: z.string().trim().min(1).max(120) });
const renameSchema = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(120) });

async function owner() {
  try {
    const userId = await getCurrentUserId();
    const db = createAdminClient();
    const { data: company } = await db.from("companies").select("id").eq("user_id", userId).maybeSingle();
    return { userId, db, companyId: company?.id as string | undefined };
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }
}

/** Create an empty list the user fills themselves. */
export async function POST(request: NextRequest) {
  const ctx = await owner();
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.companyId) return NextResponse.json({ error: "Set up your company first" }, { status: 400 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Give the list a name" }, { status: 400 });
  const { data, error } = await ctx.db
    .from("prospect_lists")
    .insert({
      user_id: ctx.userId,
      company_id: ctx.companyId,
      name: parsed.data.name,
      criteria: { source: "manual" },
      status: "completed",
      requested_count: 0,
      completed_at: new Date().toISOString(),
    })
    .select("id, name, created_at")
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Could not create the list" }, { status: 500 });
  return NextResponse.json({ list: { ...data, source: "manual" } });
}

export async function PATCH(request: NextRequest) {
  const ctx = await owner();
  if (ctx instanceof NextResponse) return ctx;
  const parsed = renameSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { error } = await ctx.db.from("prospect_lists").update({ name: parsed.data.name }).eq("id", parsed.data.id).eq("user_id", ctx.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
