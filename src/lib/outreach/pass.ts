/**
 * One OpenOutSend-style send pass: due enrollments → draft → guarded send → log.
 * Does not wait or loop; Cloud Scheduler / POST /api/cron/outreach-send-pass fires this repeatedly.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { ConnectedInbox } from "@/lib/inbox/gmail";
import { draftOpener, renderTemplate } from "./draft";
import { checkSendGuards, withinSendingWindow } from "./guards";
import { sendViaInbox } from "./send";

const DEFAULT_BATCH = 10;

export interface PassResult {
  opened: number;
  failed: number;
  skipped: number;
  holding: string;
}

function firstName(fullName: string | null | undefined): string {
  return (fullName ?? "").trim().split(/\s+/)[0] ?? "";
}

export async function runOutreachSendPass(opts: {
  userId?: string;
  limit?: number;
} = {}): Promise<PassResult> {
  const result: PassResult = { opened: 0, failed: 0, skipped: 0, holding: "" };
  const limit = opts.limit ?? Number(process.env.OUTREACH_PASS_BATCH ?? DEFAULT_BATCH);

  if (!withinSendingWindow()) {
    result.holding = "outside sending window";
    return result;
  }

  const db = createAdminClient();
  const now = new Date().toISOString();

  let query = db
    .from("enrollments")
    .select(
      `
      id,
      current_step,
      thread_id,
      sequence_id,
      contact_id,
      sequences!inner (
        id,
        user_id,
        company_id,
        status,
        from_inbox_id,
        sequence_steps ( id, step_order, delay_days, subject_template, body_template, stop_on_reply )
      ),
      contacts!inner (
        id,
        full_name,
        title,
        email,
        qualify_reason,
        archived_at,
        prospect_companies!contacts_prospect_company_id_fkey!inner ( name, domain )
      )
    `
    )
    .eq("status", "active")
    .lte("next_send_at", now)
    .eq("sequences.status", "active")
    .is("contacts.archived_at", null)
    .order("next_send_at", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 50));

  if (opts.userId) {
    query = query.eq("sequences.user_id", opts.userId);
  }

  const { data: due, error } = await query;
  if (error) throw new Error(error.message);
  if (!due?.length) {
    result.holding = "no due enrollments";
    return result;
  }

  const inboxCache = new Map<string, ConnectedInbox | null>();

  async function loadInbox(id: string | null): Promise<ConnectedInbox | null> {
    if (!id) return null;
    if (inboxCache.has(id)) return inboxCache.get(id) ?? null;
    const { data } = await db
      .from("connected_inboxes")
      .select("*")
      .eq("id", id)
      .eq("status", "connected")
      .maybeSingle();
    inboxCache.set(id, (data as ConnectedInbox | null) ?? null);
    return inboxCache.get(id) ?? null;
  }

  for (const row of due) {
    const sequence = row.sequences as unknown as {
      id: string;
      user_id: string;
      company_id: string;
      status: string;
      from_inbox_id: string | null;
      sequence_steps: Array<{
        id: string;
        step_order: number;
        delay_days: number;
        subject_template: string | null;
        body_template: string;
        stop_on_reply: boolean;
      }>;
    };
    const contact = row.contacts as unknown as {
      id: string;
      full_name: string | null;
      title: string | null;
      email: string | null;
      qualify_reason: string | null;
      prospect_companies: { name: string; domain: string };
    };

    const steps = [...(sequence.sequence_steps ?? [])].sort(
      (a, b) => a.step_order - b.step_order
    );
    const nextIndex = row.current_step; // 0-based: steps already sent
    const step = steps[nextIndex];
    if (!step) {
      await db
        .from("enrollments")
        .update({ status: "completed", ended_at: now, next_send_at: null })
        .eq("id", row.id);
      result.skipped += 1;
      continue;
    }

    const inbox = await loadInbox(sequence.from_inbox_id);
    const guards = await checkSendGuards({
      email: contact.email,
      inboxId: inbox?.id,
    });
    if (!guards.ok) {
      result.skipped += 1;
      result.holding = guards.reason;
      if (guards.reason === "daily_cap" || guards.reason === "outside_window") {
        break;
      }
      if (guards.reason === "suppressed") {
        await db
          .from("enrollments")
          .update({ status: "unsubscribed", ended_at: now, next_send_at: null })
          .eq("id", row.id);
      }
      continue;
    }

    const company = contact.prospect_companies;
    const vars = {
      first_name: firstName(contact.full_name),
      full_name: contact.full_name ?? "",
      company: company?.name ?? "",
      domain: company?.domain ?? "",
      title: contact.title ?? "",
    };

    let subject = step.subject_template
      ? renderTemplate(step.subject_template, vars)
      : "";
    let body = renderTemplate(step.body_template, vars);

    // Prefer a per-contact draft for this step when present.
    const { data: savedDraft } = await db
      .from("outreach_drafts")
      .select("subject, body")
      .eq("user_id", sequence.user_id)
      .eq("contact_id", contact.id)
      .eq("sequence_id", sequence.id)
      .eq("sequence_step_id", step.id)
      .maybeSingle();
    if (savedDraft?.subject?.trim() && savedDraft?.body?.trim()) {
      subject = renderTemplate(savedDraft.subject, vars);
      body = renderTemplate(savedDraft.body, vars);
    }

    const wantsAi =
      nextIndex === 0 &&
      (Boolean(contact.qualify_reason) ||
        !step.body_template.trim() ||
        step.body_template.trim().toLowerCase() === "{{ai}}");

    if (wantsAi || !body.trim()) {
      const { data: blueprint } = await db
        .from("company_blueprints")
        .select("product_summary")
        .eq("company_id", sequence.company_id)
        .maybeSingle();

      try {
        const draft = await draftOpener({
          contactName: contact.full_name,
          contactTitle: contact.title,
          contactEmail: contact.email!,
          companyName: company?.name ?? company?.domain ?? "their company",
          companyDomain: company?.domain ?? "",
          qualifyReason: contact.qualify_reason,
          productSummary: blueprint?.product_summary ?? null,
          senderName: inbox!.email_address,
        });
        subject = subject || draft.subject;
        body = draft.body;
      } catch (error) {
        console.error("[outreach] draft failed", row.id, error);
        result.failed += 1;
        continue;
      }
    }

    if (!subject.trim()) subject = `Quick question for ${vars.first_name || "you"}`;

    const { data: pendingSend, error: insertError } = await db
      .from("email_sends")
      .insert({
        enrollment_id: row.id,
        sequence_step_id: step.id,
        subject,
        body,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError || !pendingSend) {
      result.failed += 1;
      continue;
    }

    try {
      const sent = await sendViaInbox(inbox!, {
        to: contact.email!,
        subject,
        body,
        threadId: row.thread_id,
      });

      await db
        .from("email_sends")
        .update({
          status: "sent",
          sent_at: now,
          provider_message_id: sent.providerMessageId,
          thread_id: sent.threadId,
        })
        .eq("id", pendingSend.id);

      await db.from("email_events").insert({
        email_send_id: pendingSend.id,
        enrollment_id: row.id,
        type: "sent",
        metadata: { provider: "gmail" },
        occurred_at: now,
      });

      const nextStep = nextIndex + 1;
      if (nextStep >= steps.length) {
        await db
          .from("enrollments")
          .update({
            status: "completed",
            current_step: nextStep,
            thread_id: sent.threadId,
            next_send_at: null,
            ended_at: now,
          })
          .eq("id", row.id);
      } else {
        const delayDays = steps[nextStep]?.delay_days ?? 2;
        const nextAt = new Date(Date.now() + delayDays * 86_400_000).toISOString();
        await db
          .from("enrollments")
          .update({
            current_step: nextStep,
            thread_id: sent.threadId,
            next_send_at: nextAt,
          })
          .eq("id", row.id);
      }

      result.opened += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db
        .from("email_sends")
        .update({ status: "failed", error: message })
        .eq("id", pendingSend.id);
      result.failed += 1;
      console.error("[outreach] send failed", row.id, error);
    }
  }

  if (!result.holding) {
    result.holding =
      result.opened > 0
        ? `opened ${result.opened}`
        : result.skipped > 0
          ? "skipped"
          : "idle";
  }
  return result;
}
