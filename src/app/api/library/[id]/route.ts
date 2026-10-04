import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOCUMENT_KINDS, deleteDocument, getDocument, moveDocument, saveDocument, setDocumentPublic } from "@/lib/workspace/documents";

export const runtime = "nodejs";

async function auth() {
  try {
    return { userId: await getCurrentUserId() };
  } catch (error) {
    if (error instanceof AuthenticationError) return { response: NextResponse.json({ error: error.message }, { status: 401 }) };
    throw error;
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await auth();
  if (a.response) return a.response;
  const { id } = await params;
  const doc = await getDocument(createAdminClient(), a.userId!, id);
  return doc ? NextResponse.json({ document: doc }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

const patchSchema = z.object({
  kind: z.enum(DOCUMENT_KINDS).optional(),
  title: z.string().trim().min(1).max(160).optional(),
  body: z.string().max(60_000).optional(),
  folder: z.string().max(200).optional(),
  public: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await auth();
  if (a.response) return a.response;
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const db = createAdminClient();
  const existing = await getDocument(db, a.userId!, id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let doc = existing;
  const { public: isPublic, folder, ...edits } = parsed.data;
  try {
    if (folder !== undefined) doc = await moveDocument(db, a.userId!, id, folder);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not move" }, { status: 400 });
  }
  if (edits.kind || edits.title !== undefined || edits.body !== undefined) {
    doc = await saveDocument(db, a.userId!, {
      id,
      kind: edits.kind ?? existing.kind,
      title: edits.title ?? existing.title,
      folder: doc.folder,
      body: edits.body,
    });
  }
  if (typeof isPublic === "boolean") doc = await setDocumentPublic(db, a.userId!, id, isPublic);
  return NextResponse.json({ document: doc });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await auth();
  if (a.response) return a.response;
  const { id } = await params;
  const ok = await deleteDocument(createAdminClient(), a.userId!, id);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
