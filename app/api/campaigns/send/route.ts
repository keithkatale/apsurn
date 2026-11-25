import { z } from "zod";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { AccountRequiredError, accountRequiredResponse, assertRegisteredUser } from "@/lib/auth/guest";
import { getBillingState } from "@/lib/billing/credits";
import { SMTP_SCOPE, sendSmtpMessage, type ConnectedInbox } from "@/lib/inbox/smtp";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  to: z.string().trim().email().max(200),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(20_000),
});

/** Sends one campaign email through the user's connected Gmail (SMTP + App Password). */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Add a valid recipient, subject and message." }, { status: 400 });
  }

  try {
    const userId = await getCurrentUserId();
    await assertRegisteredUser(userId);

    // Sending opens once the account has credits (the $1 unlock, a plan or a top-up).
    const billing = await getBillingState(userId);
    if (!billing.active) {
      return Response.json(
        { error: "Unlock your sending credits to send emails.", code: "plan_required" },
        { status: 402 },
      );
    }

    if (!rateLimit(`campaign-send:${userId}`, 60, 10 * 60_000)) {
      return Response.json({ error: "Sending too fast. Wait a few minutes and try again." }, { status: 429 });
    }

    const db = createAdminClient();
    const { data: inbox } = await db
      .from("connected_inboxes")
      .select("id, user_id, provider, email_address, access_token_enc, refresh_token_enc, token_expires_at, status, scopes")
      .eq("user_id", userId)
      .eq("status", "connected")
      .contains("scopes", [SMTP_SCOPE])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!inbox) {
      return Response.json({ error: "Connect Gmail before sending.", code: "inbox_required" }, { status: 409 });
    }

    const result = await sendSmtpMessage(inbox as ConnectedInbox, parsed.data);
    return Response.json({ ok: true, from: inbox.email_address, messageId: result.providerMessageId });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return Response.json({ error: "Sign in to send.", code: "auth_required" }, { status: 401 });
    }
    if (error instanceof AccountRequiredError) {
      return Response.json(accountRequiredResponse(), { status: 403 });
    }
    const message = error instanceof Error ? error.message : "Could not send the email.";
    console.error("[campaigns/send]", message);
    return Response.json({ error: message }, { status: 502 });
  }
}
