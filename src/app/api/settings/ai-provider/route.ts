import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { AI_PROVIDERS, getActiveProvider, setActiveProvider } from "@/lib/ai/settings";

const requestSchema = z.object({ provider: z.enum(AI_PROVIDERS) });

export async function GET() {
  try {
    await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const provider = await getActiveProvider();
  return NextResponse.json({ provider });
}

export async function POST(request: NextRequest) {
  try {
    await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid provider" }, { status: 400 });

  await setActiveProvider(parsed.data.provider);
  return NextResponse.json({ ok: true, provider: parsed.data.provider });
}
