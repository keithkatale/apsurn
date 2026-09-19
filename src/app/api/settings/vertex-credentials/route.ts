import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { getVertexServiceAccountJson, setVertexServiceAccountJson } from "@/lib/ai/settings";
import { parseServiceAccountJson } from "@/lib/ai/vertex";

const requestSchema = z.object({ json: z.string().trim().min(1).max(20_000) });

/** Never returns the stored credential — just whether one is configured. */
export async function GET() {
  try {
    await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const json = await getVertexServiceAccountJson();
  let clientEmail: string | null = null;
  if (json) {
    try {
      clientEmail = (parseServiceAccountJson(json).client_email as string) ?? null;
    } catch {
      clientEmail = null;
    }
  }
  return NextResponse.json({ configured: Boolean(json), clientEmail });
}

export async function POST(request: NextRequest) {
  try {
    await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Paste the service-account JSON key" }, { status: 400 });

  try {
    parseServiceAccountJson(parsed.data.json);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid key" }, { status: 400 });
  }

  await setVertexServiceAccountJson(parsed.data.json);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  try {
    await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  await setVertexServiceAccountJson(null);
  return NextResponse.json({ ok: true });
}
