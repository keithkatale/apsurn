import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { getOwnedArtifact, updateArtifact } from "@/lib/copilot/artifacts";

const patchSchema = z.object({
  state: z.record(z.string(), z.unknown()).optional(),
  title: z.string().max(200).nullable().optional(),
});

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }
  const { id } = await params;
  const artifact = await getOwnedArtifact(createAdminClient(), userId, id);
  if (!artifact) return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
  return NextResponse.json({ artifact });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const artifact = await updateArtifact(createAdminClient(), userId, id, parsed.data);
  if (!artifact) return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
  return NextResponse.json({ artifact });
}
