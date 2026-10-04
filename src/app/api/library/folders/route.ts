import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createFolder, deleteFolder, renameFolder } from "@/lib/workspace/documents";

export const runtime = "nodejs";

async function handle(run: (userId: string) => Promise<NextResponse>) {
  try {
    return await run(await getCurrentUserId());
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Something went wrong" }, { status: 400 });
  }
}

const pathSchema = z.object({ path: z.string().trim().min(1).max(200) });

export function POST(request: NextRequest) {
  return handle(async (userId) => {
    const parsed = pathSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    return NextResponse.json({ path: await createFolder(createAdminClient(), userId, parsed.data.path) });
  });
}

const renameSchema = z.object({ from: z.string().trim().min(1).max(200), to: z.string().trim().min(1).max(200) });

export function PATCH(request: NextRequest) {
  return handle(async (userId) => {
    const parsed = renameSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    return NextResponse.json({ path: await renameFolder(createAdminClient(), userId, parsed.data.from, parsed.data.to) });
  });
}

export function DELETE(request: NextRequest) {
  return handle(async (userId) => {
    const path = request.nextUrl.searchParams.get("path") ?? "";
    const ok = await deleteFolder(createAdminClient(), userId, path);
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  });
}
