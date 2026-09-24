import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { appOrigin, getDodoClient } from "@/lib/billing/dodo";
import {
  PLANS,
  TOPUPS,
  TRIAL_DAYS,
  dodoBrandId,
  productIdForPlan,
  productIdForTopup,
  type PlanKey,
  type TopupKey,
} from "@/lib/billing/plans";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  plan: z.enum(["startup", "growth", "pro"]).optional(),
  topup: z.enum(["credits_500", "credits_2000"]).optional(),
  trial: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: "Account email required for checkout" }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid checkout request" }, { status: 400 });
    }

    const { plan, topup, trial } = parsed.data;
    if (!plan && !topup) {
      return NextResponse.json({ error: "Choose a plan or top-up" }, { status: 400 });
    }
    if (plan && topup) {
      return NextResponse.json({ error: "Choose either a plan or a top-up" }, { status: 400 });
    }

    const productId = plan ? productIdForPlan(plan as PlanKey) : productIdForTopup(topup as TopupKey);
    const planKey = plan ?? "topup";
    const withTrial = Boolean(trial || plan); // subscriptions always carry product trial; force 7 days

    const client = getDodoClient();
    const returnUrl =
      process.env.DODO_PAYMENTS_RETURN_URL?.trim() ||
      `${appOrigin()}/dashboard/campaigns?billing=success`;

    const cookieStore = await cookies();
    const datafastVisitorId = cookieStore.get("datafast_visitor_id")?.value;

    const session = await client.checkoutSessions.create({
      product_cart: [{ product_id: productId, quantity: 1 }],
      brand_id: dodoBrandId(),
      ...(plan
        ? {
            subscription_data: {
              trial_period_days: withTrial ? TRIAL_DAYS : undefined,
            },
          }
        : {}),
      customer: {
        email: user.email,
        name: user.user_metadata?.full_name || user.user_metadata?.name || undefined,
      },
      return_url: returnUrl,
      metadata: {
        user_id: userId,
        plan_key: planKey,
        ...(datafastVisitorId ? { datafast_visitor_id: datafastVisitorId } : {}),
      },
    } as Parameters<typeof client.checkoutSessions.create>[0]);

    const db = createAdminClient();
    // Soft-link email ahead of webhook (never overwrite an existing Dodo customer id).
    const { data: existingCustomer } = await db
      .from("billing_customers")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!existingCustomer) {
      await db.from("billing_customers").insert({
        user_id: userId,
        dodo_customer_id: `pending_${userId}`,
        email: user.email,
      });
    } else {
      await db
        .from("billing_customers")
        .update({ email: user.email, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
    }

    const checkoutUrl =
      (session as { checkout_url?: string }).checkout_url ||
      (session as { url?: string }).url;

    if (!checkoutUrl) {
      return NextResponse.json({ error: "Checkout session missing URL" }, { status: 502 });
    }

    return NextResponse.json({
      checkoutUrl,
      sessionId: (session as { session_id?: string }).session_id,
      plan: plan ? PLANS[plan as PlanKey].name : TOPUPS[topup as TopupKey].name,
      trialDays: plan ? TRIAL_DAYS : 0,
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("[billing/checkout]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Checkout failed" },
      { status: 500 },
    );
  }
}
