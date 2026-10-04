import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOCUMENT_KINDS, listDocuments, listFolders, saveDocument } from "@/lib/workspace/documents";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const db = createAdminClient();
    const docs = await listDocuments(db, userId, { query: request.nextUrl.searchParams.get("q") ?? undefined });
    return NextResponse.json({ documents: docs, folders: await listFolders(db, userId, docs) });
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load the Library" }, { status: 500 });
  }
}

const createSchema = z.object({
  kind: z.enum(DOCUMENT_KINDS).default("note"),
  folder: z.string().max(200).optional(),
  title: z.string().trim().min(1).max(160),
  body: z.string().max(60_000).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    const doc = await saveDocument(createAdminClient(), userId, parsed.data);
    return NextResponse.json({ document: doc });
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save" }, { status: 500 });
  }
}
