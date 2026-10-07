import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { getBillingStatus } from "@/lib/billing/entitlements";
import { SETUP_FREE_LEAD_CAP } from "@/lib/billing/plans";
import { LeadDraftError, streamLeadDraft } from "@/lib/outreach/lead-draft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  contactId: z.string().uuid(),
  campaignId: z.string().uuid(),
  stepId: z.string().uuid().optional(),
  stepIndex: z.number().int().min(0).max(9).optional(),
  regenerate: z.boolean().optional(),
});

function sse(payload: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

/**
 * Writes one lead's email and streams it as it is produced, like a chat
 * reply: `subject` and `body` events carry text to append, `done` carries the
 * saved, formatted email. People without a card get the first few emails free
 * so the campaigns they just created are already written when they open them.
 */
export async function POST(request: NextRequest) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw error;
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const db = createAdminClient();
  const billing = await getBillingStatus(userId);
  let charge = true;
  if (!billing.active) {
    const { count } = await db.from("outreach_drafts").select("id", { count: "exact", head: true }).eq("user_id", userId);
    if ((count ?? 0) >= SETUP_FREE_LEAD_CAP) {
      return NextResponse.json(
        { error: "Add a card to start with 50 free credits to write more emails.", code: "billing_required" },
        { status: 402 },
      );
    }
    charge = false;
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => controller.enqueue(sse(payload));
      try {
        const draft = await streamLeadDraft(
          db,
          {
            userId,
            contactId: parsed.data.contactId,
            sequenceId: parsed.data.campaignId,
            stepId: parsed.data.stepId,
            stepIndex: parsed.data.stepIndex,
            regenerate: parsed.data.regenerate,
          },
          { onSubject: (text) => send({ type: "subject", text }), onBody: (text) => send({ type: "body", text }) },
          { charge },
        );
        send({ type: "done", ...draft });
      } catch (error) {
        const code = error instanceof LeadDraftError ? error.code : "draft_failed";
        send({ type: "error", code, error: code === "draft_failed" ? "Could not write this email" : error instanceof Error ? error.message : "Could not write this email" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
