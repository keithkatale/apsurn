import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { getBillingStatus } from "@/lib/billing/entitlements";
import { syncSubscriptionFromDodo } from "@/lib/billing/sync";

const bodySchema = z.object({
  subscriptionId: z.string().trim().min(3).max(120),
  email: z.string().email().optional(),
});

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "subscriptionId required" }, { status: 400 });
    }

    const synced = await syncSubscriptionFromDodo({
      userId,
      subscriptionId: parsed.data.subscriptionId,
      email: parsed.data.email,
    });

    const status = await getBillingStatus(userId);
    return NextResponse.json({ ...status, synced });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("[billing/sync]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 },
    );
  }
}
