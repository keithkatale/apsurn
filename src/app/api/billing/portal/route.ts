import { NextResponse } from "next/server";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { appOrigin, getDodoClient } from "@/lib/billing/dodo";
import { createAdminClient } from "@/lib/supabase/admin";

/** Hosted Dodo customer portal: invoices, cancel, plan change, payment method. */
export async function POST() {
  try {
    const userId = await getCurrentUserId();
    const db = createAdminClient();
    const { data } = await db
      .from("billing_customers")
      .select("dodo_customer_id")
      .eq("user_id", userId)
      .maybeSingle();
    const customerId = data?.dodo_customer_id;
    if (!customerId || customerId.startsWith("pending_")) {
      return NextResponse.json({ error: "Start a plan before managing a subscription." }, { status: 400 });
    }

    const session = await getDodoClient().customers.customerPortal.create(customerId, {
      return_url: `${appOrigin()}/dashboard/settings`,
    });
    const url = session.link;
    if (!url) {
      return NextResponse.json({ error: "Portal session missing a link" }, { status: 502 });
    }
    return NextResponse.json({ url });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("[billing/portal]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not open the subscription portal" },
      { status: 500 },
    );
  }
}
