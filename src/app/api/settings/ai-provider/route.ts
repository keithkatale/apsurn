import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationError } from "@/lib/auth/session";
import { AdminAccessError, requireAdminUser } from "@/lib/auth/admin";
import { AI_PROVIDERS, getActiveProvider, setActiveProvider } from "@/lib/ai/settings";

const requestSchema = z.object({ provider: z.enum(AI_PROVIDERS) });

function handleAuthError(error: unknown) {
  if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
  if (error instanceof AdminAccessError) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  throw error;
}

export async function GET() {
  try {
    await requireAdminUser();
  } catch (error) {
    return handleAuthError(error);
  }

  const provider = await getActiveProvider();
  return NextResponse.json({ provider });
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminUser();
  } catch (error) {
    return handleAuthError(error);
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid provider" }, { status: 400 });

  await setActiveProvider(parsed.data.provider);
  return NextResponse.json({ ok: true, provider: parsed.data.provider });
}
