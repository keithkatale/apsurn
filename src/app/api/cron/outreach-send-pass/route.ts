import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cronUnauthorized, isCronAuthorized } from "@/lib/jobs/auth";
import { runOutreachCron } from "@/lib/jobs/handlers";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  userId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) return cronUnauthorized();
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  const result = await runOutreachCron(parsed.success ? parsed.data.userId : undefined);
  return NextResponse.json(result);
}
