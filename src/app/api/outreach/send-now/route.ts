import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { AccountRequiredError, accountRequiredResponse, assertRegisteredUser } from "@/lib/auth/guest";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import type { ConnectedInbox } from "@/lib/inbox/gmail";
import { ensureSendableEmail } from "@/lib/outreach/email-check";
import { checkSendGuards } from "@/lib/outreach/guards";
import { ensureLeadDraft, LeadDraftError } from "@/lib/outreach/lead-draft";
import { sendViaInbox } from "@/lib/outreach/send";
import { getOwnedContact } from "@/lib/outreach/owned-contact";
import { resolveMergeFields } from "@/lib/outreach/merge-fields";
import { enrollContacts } from "@/lib/sequences/mutations";
import { requireActiveBilling } from "@/lib/billing/entitlements";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  contactId: z.string().uuid(),
  campaignId: z.string().uuid().optional(),
  // Omit both to send this lead's own personalized email for the campaign (written from what we know about them).
  subject: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().min(1).max(20000).optional(),
});

export async function POST(request: NextRequest) {
  try {
    let userId: string;
    try {
      userId = await getCurrentUserId();
      await assertRegisteredUser(userId);
    } catch (error) {
      if (error instanceof AccountRequiredError) return NextResponse.json(accountRequiredResponse(), { status: 403 });
      if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
      throw error;
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    try {
      await requireActiveBilling(userId);
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Billing required",
          code: "billing_required",
        },
        { status: 402 },
      );
    }

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

    const emailCheck = await ensureSendableEmail(db, contact.id, contact.email, contact.email_status);
    if (!emailCheck.ok) {
      return NextResponse.json(
        { error: "This email address doesn't accept mail — it failed verification.", code: "invalid_email" },
        { status: 400 },
      );
    }

    const leadSource = {
      fullName: contact.full_name,
      title: contact.title,
      email: contact.email,
      companyName: contact.company.name,
      companyDomain: contact.company.domain,
    };
    let rawSubject = parsed.data.subject;
    let rawBody = parsed.data.body;
    if (!rawSubject || !rawBody) {
      if (!parsed.data.campaignId) return NextResponse.json({ error: "Write a subject and body first." }, { status: 400 });
      try {
        const draft = await ensureLeadDraft(db, { userId, contactId: contact.id, sequenceId: parsed.data.campaignId, stepIndex: 0 });
        rawSubject = draft.subject;
        rawBody = draft.body;
      } catch (error) {
        if (error instanceof LeadDraftError) {
          const status = error.code === "credits_exhausted" ? 402 : error.code === "draft_failed" ? 500 : 404;
          return NextResponse.json({ error: error.code === "draft_failed" ? "Could not write this email" : error.message, code: error.code }, { status });
        }
        throw error;
      }
    }
    const subject = resolveMergeFields(rawSubject, leadSource);
    const body = resolveMergeFields(rawBody, leadSource);

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
          subject,
          body,
          status: "pending",
        })
        .select("id")
        .single();
      pendingSendId = pendingSend?.id ?? null;
    }

    const sent = await sendViaInbox(inbox as ConnectedInbox, {
      to: contact.email,
      subject,
      body,
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
