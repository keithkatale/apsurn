import { z } from "zod";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { AccountRequiredError, accountRequiredResponse, assertRegisteredUser } from "@/lib/auth/guest";
import { getBillingState, hasUnlocked } from "@/lib/billing/credits";
import { isLiveBilling } from "@/lib/billing/plans";
import { appUrl, ensureUnlockProductId, getDodo, isDodoConfigured } from "@/lib/billing/dodo";
import { OFFERED_PLAN_KEYS, TOPUPS, UNLOCK, productIdForPlan, productIdForTopup } from "@/lib/billing/plans";
import { logEvent } from "@/lib/events";
import { rateLimit } from "@/lib/rate-limit";

const bodySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("plan"), plan: z.enum(["startup", "growth", "pro"]) }),
  z.object({ kind: z.literal("unlock"), returnTo: z.string().optional() }),
  z.object({ kind: z.literal("topup"), topup: z.enum(["credits_500", "credits_2000"]) }),
]);

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid checkout request" }, { status: 400 });
  if (!isDodoConfigured()) {
    return Response.json({ error: "Billing is not configured yet." }, { status: 503 });
  }

  try {
    const userId = await getCurrentUserId();
    if (!rateLimit(`checkout:${userId}`, 10, 60_000)) {
      return Response.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
    }
    const user = await assertRegisteredUser(userId);
    const email = user.email;
    if (!email) return Response.json({ error: "Your account has no email address." }, { status: 400 });

    const state = await getBillingState(userId);
    await logEvent("checkout_started", { userId, props: { kind: parsed.data.kind } });
    const dodo = getDodo();
    const back = `${appUrl()}/settings`;

    // $1 unlock: one-time, for registered accounts that have not unlocked yet.
    if (parsed.data.kind === "unlock") {
      if (await hasUnlocked(userId)) {
        return Response.json({ error: "Your sending credits are already unlocked.", code: "already_unlocked" }, { status: 409 });
      }
      const productId = await ensureUnlockProductId();
      const rt = parsed.data.returnTo;
      const returnTo = rt && rt.startsWith("/") && !rt.startsWith("//") ? rt : "/settings";
      const sep = returnTo.includes("?") ? "&" : "?";
      const session = await dodo.checkoutSessions.create({
        product_cart: [{ product_id: productId, quantity: 1 }],
        customer: state.dodoCustomerId ? { customer_id: state.dodoCustomerId } : { email, name: user.user_metadata?.name ?? null },
        metadata: { user_id: userId, kind: "unlock" },
        return_url: `${appUrl()}${returnTo}${sep}unlocked=1`,
      });
      if (!session.checkout_url) throw new Error("Dodo did not return a checkout URL");
      return Response.json({ url: session.checkout_url, mode: isLiveBilling() ? "live" : "test", credits: UNLOCK.credits });
    }

    // Plan: change an existing subscription in place instead of creating a second one.
    if (parsed.data.kind === "plan") {
      const { plan } = parsed.data;
      if (plan === "pro" && state.planKey !== "pro") {
        return Response.json({ error: "That plan is not available." }, { status: 400 });
      }
      if (plan !== "pro" && !(OFFERED_PLAN_KEYS as readonly string[]).includes(plan)) {
        return Response.json({ error: "That plan is not available." }, { status: 400 });
      }

      if (state.active && state.subscriptionId) {
        if (state.planKey === plan) {
          return Response.json({ error: "You're already on this plan." }, { status: 409 });
        }
        await dodo.subscriptions.changePlan(state.subscriptionId, {
          product_id: productIdForPlan(plan),
          quantity: 1,
          proration_billing_mode: "difference_immediately",
        });
        // The plan_changed webhook updates the account and credits.
        return Response.json({ changed: true, plan });
      }

      const session = await dodo.checkoutSessions.create({
        product_cart: [{ product_id: productIdForPlan(plan), quantity: 1 }],
        customer: state.dodoCustomerId ? { customer_id: state.dodoCustomerId } : { email, name: user.user_metadata?.name ?? null },
        metadata: { user_id: userId, kind: "plan", plan_key: plan },
        return_url: `${back}?billing=success`,
      });
      if (!session.checkout_url) throw new Error("Dodo did not return a checkout URL");
      return Response.json({ url: session.checkout_url });
    }

    // Top-up: only for subscribers (credits are used by paid features).
    if (!state.active) {
      return Response.json(
        { error: "Choose a plan before buying credits.", code: "plan_required" },
        { status: 402 },
      );
    }
    const { topup } = parsed.data;
    const session = await dodo.checkoutSessions.create({
      product_cart: [{ product_id: productIdForTopup(topup), quantity: 1 }],
      customer: state.dodoCustomerId ? { customer_id: state.dodoCustomerId } : { email },
      metadata: { user_id: userId, kind: "topup", topup_key: topup },
      return_url: `${back}?billing=topup`,
    });
    if (!session.checkout_url) throw new Error("Dodo did not return a checkout URL");
    return Response.json({ url: session.checkout_url, credits: TOPUPS[topup].credits });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return Response.json({ error: "Sign in to continue.", code: "auth_required" }, { status: 401 });
    }
    if (error instanceof AccountRequiredError) {
      return Response.json(accountRequiredResponse(), { status: 403 });
    }
    console.error("[billing] checkout failed", error);
    return Response.json({ error: "Could not start checkout. Please try again." }, { status: 500 });
  }
}
