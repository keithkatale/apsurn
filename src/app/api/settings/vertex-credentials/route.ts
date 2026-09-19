import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationError } from "@/lib/auth/session";
import { AdminAccessError, requireAdminUser } from "@/lib/auth/admin";
import { getVertexServiceAccountJson, setVertexServiceAccountJson } from "@/lib/ai/settings";
import { parseServiceAccountJson } from "@/lib/ai/vertex";

const requestSchema = z.object({ json: z.string().trim().min(1).max(20_000) });

function handleAuthError(error: unknown) {
  if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
  if (error instanceof AdminAccessError) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  throw error;
}

/** Never returns the stored credential — just whether one is configured. */
export async function GET() {
  try {
    await requireAdminUser();
  } catch (error) {
    return handleAuthError(error);
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
    await requireAdminUser();
  } catch (error) {
    return handleAuthError(error);
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
    await requireAdminUser();
  } catch (error) {
    return handleAuthError(error);
  }

  await setVertexServiceAccountJson(null);
  return NextResponse.json({ ok: true });
}
