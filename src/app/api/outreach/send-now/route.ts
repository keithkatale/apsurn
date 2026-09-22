import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import type { ConnectedInbox } from "@/lib/inbox/gmail";
import { checkSendGuards } from "@/lib/outreach/guards";
import { sendViaInbox } from "@/lib/outreach/send";
import { getOwnedContact } from "@/lib/outreach/owned-contact";
import { enrollContacts } from "@/lib/sequences/mutations";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  contactId: z.string().uuid(),
  campaignId: z.string().uuid().optional(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20000),
});

export async function POST(request: NextRequest) {
  try {
    let userId: string;
    try {
      userId = await getCurrentUserId();
    } catch (error) {
      if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
      throw error;
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const db = createAdminClient();
    const { data: inbox } = await db
      .from("connected_inboxes")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "connected")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!inbox) {
      return NextResponse.json({ error: "Connect Gmail to send as you.", code: "no_inbox" }, { status: 400 });
    }

    const contact = await getOwnedContact(db, userId, parsed.data.contactId);
    if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    if (!contact.email) return NextResponse.json({ error: "This contact has no email yet" }, { status: 400 });

    const guards = await checkSendGuards({
      email: contact.email,
      inboxId: inbox.id,
      ignoreWindow: true,
    });
    if (!guards.ok) {
      const message =
        guards.reason === "daily_cap"
          ? "Daily send cap reached"
          : guards.reason === "suppressed"
            ? "This address is suppressed"
            : "Cannot send this email";
      return NextResponse.json({ error: message, code: guards.reason }, { status: 400 });
    }

    let enrollmentId: string | null = null;
    let stepId: string | null = null;
    let threadId: string | null = null;
    let currentStep = 0;

    if (parsed.data.campaignId) {
      const { data: sequence } = await db
        .from("sequences")
        .select("id, from_inbox_id, sequence_steps(id, step_order)")
        .eq("id", parsed.data.campaignId)
        .eq("user_id", userId)
        .maybeSingle();
      if (sequence) {
        const step = [...(sequence.sequence_steps ?? [])].sort((a, b) => a.step_order - b.step_order)[0];
        stepId = step?.id ?? null;
        if (!sequence.from_inbox_id) {
          await db.from("sequences").update({ from_inbox_id: inbox.id, status: "active" }).eq("id", sequence.id);
        }
        const enrolled = await enrollContacts(db, userId, sequence.id, [contact.id]);
        if (enrolled.ok) {
          const { data: enrollment } = await db
            .from("enrollments")
            .select("id, thread_id, current_step")
            .eq("sequence_id", sequence.id)
            .eq("contact_id", contact.id)
            .maybeSingle();
          if (enrollment) {
            enrollmentId = enrollment.id;
            threadId = enrollment.thread_id;
            currentStep = enrollment.current_step;
          }
        }
      }
    }

    let pendingSendId: string | null = null;
    if (enrollmentId && stepId) {
      const { data: pendingSend } = await db
        .from("email_sends")
        .insert({
          enrollment_id: enrollmentId,
          sequence_step_id: stepId,
          subject: parsed.data.subject,
          body: parsed.data.body,
          status: "pending",
        })
        .select("id")
        .single();
      pendingSendId = pendingSend?.id ?? null;
    }

    const sent = await sendViaInbox(inbox as ConnectedInbox, {
      to: contact.email,
      subject: parsed.data.subject,
      body: parsed.data.body,
      threadId,
    });

    const now = new Date().toISOString();
    if (pendingSendId) {
      await db
        .from("email_sends")
        .update({
          status: "sent",
          sent_at: now,
          provider_message_id: sent.providerMessageId,
          thread_id: sent.threadId,
        })
        .eq("id", pendingSendId);
    }
    if (enrollmentId) {
      if (pendingSendId) {
        await db.from("email_events").insert({
          email_send_id: pendingSendId,
          enrollment_id: enrollmentId,
          type: "sent",
          metadata: { provider: inbox.provider, manual: true },
          occurred_at: now,
        });
      }
      await db
        .from("enrollments")
        .update({
          current_step: Math.max(currentStep, 1),
          thread_id: sent.threadId,
          status: "active",
        })
        .eq("id", enrollmentId);
    }

    return NextResponse.json({ sent: true, threadId: sent.threadId, from: inbox.email_address });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Send failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
