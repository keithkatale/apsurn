import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { getBillingState, hasUnlocked } from "@/lib/billing/credits";
import { isDodoConfigured } from "@/lib/billing/dodo";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const state = await getBillingState(userId);
    return Response.json({ ...state, billingEnabled: isDodoConfigured(), unlocked: await hasUnlocked(userId) });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return Response.json({ error: "Sign in to continue.", code: "auth_required" }, { status: 401 });
    }
    console.error("[billing] status failed", error);
    return Response.json({ error: "Could not load billing." }, { status: 500 });
  }
}
