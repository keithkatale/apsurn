import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { computeNextWeeklyRun } from "@/lib/prospecting/scheduling";

const createSchema = z.object({
  weeklyTarget: z.number().int().min(1).max(100),
  weekday: z.number().int().min(0).max(6),
  timeOfDay: z.string().regex(/^[0-2][0-9]:[0-5][0-9]$/),
  timezone: z.string().trim().min(1).max(80).default("UTC"),
});

const updateSchema = createSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export async function GET() {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const db = createAdminClient();
  const { data: schedules, error } = await db
    .from("prospecting_schedules")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ schedules: schedules ?? [] });
}

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });

  const db = createAdminClient();
  const { data: company } = await db.from("companies").select("id").eq("user_id", userId).maybeSingle();
  if (!company) return NextResponse.json({ error: "Set up your company first" }, { status: 400 });

  const nextRun = computeNextWeeklyRun(parsed.data.timeOfDay, parsed.data.timezone, parsed.data.weekday);

  const { data: schedule, error } = await db
    .from("prospecting_schedules")
    .insert({
      user_id: userId,
      company_id: company.id,
      weekly_target: parsed.data.weeklyTarget,
      time_of_day: parsed.data.timeOfDay,
      weekday: parsed.data.weekday,
      timezone: parsed.data.timezone,
      next_run_at: nextRun.toISOString(),
    })
    .select()
    .single();
  if (error || !schedule) return NextResponse.json({ error: error?.message ?? "Failed to create schedule" }, { status: 500 });

  return NextResponse.json({ schedule }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });

  const db = createAdminClient();
  const { data: existing } = await db.from("prospecting_schedules").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Schedule not found" }, { status: 404 });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.weeklyTarget !== undefined) update.weekly_target = parsed.data.weeklyTarget;
  if (parsed.data.isActive !== undefined) update.is_active = parsed.data.isActive;

  const weekday = parsed.data.weekday ?? existing.weekday;
  const timeOfDay = parsed.data.timeOfDay ?? existing.time_of_day;
  const timezone = parsed.data.timezone ?? existing.timezone;
  if (parsed.data.weekday !== undefined) update.weekday = parsed.data.weekday;
  if (parsed.data.timeOfDay !== undefined) update.time_of_day = parsed.data.timeOfDay;
  if (parsed.data.timezone !== undefined) update.timezone = parsed.data.timezone;
  if (parsed.data.weekday !== undefined || parsed.data.timeOfDay !== undefined || parsed.data.timezone !== undefined) {
    update.next_run_at = computeNextWeeklyRun(timeOfDay, timezone, weekday).toISOString();
  }

  const { data: schedule, error } = await db.from("prospecting_schedules").update(update).eq("id", id).select().single();
  if (error || !schedule) return NextResponse.json({ error: error?.message ?? "Failed to update schedule" }, { status: 500 });

  return NextResponse.json({ schedule });
}

export async function DELETE(request: NextRequest) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const db = createAdminClient();
  const { error } = await db.from("prospecting_schedules").delete().eq("id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ deleted: true });
}
