import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { getBillingState } from "@/lib/billing/credits";
import { appUrl, getDodo, isDodoConfigured } from "@/lib/billing/dodo";

/** Dodo customer portal: update card, view invoices, cancel. */
export async function POST() {
  if (!isDodoConfigured()) {
    return Response.json({ error: "Billing is not configured yet." }, { status: 503 });
  }
  try {
    const userId = await getCurrentUserId();
    const state = await getBillingState(userId);
    if (!state.dodoCustomerId) {
      return Response.json({ error: "No billing account yet. Choose a plan first." }, { status: 404 });
    }
    const session = await getDodo().customers.customerPortal.create(state.dodoCustomerId, {
      return_url: `${appUrl()}/settings`,
    });
    return Response.json({ url: session.link });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return Response.json({ error: "Sign in to continue.", code: "auth_required" }, { status: 401 });
    }
    console.error("[billing] portal failed", error);
    return Response.json({ error: "Could not open the billing portal." }, { status: 500 });
  }
}
