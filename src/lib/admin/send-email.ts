import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient, isResendConfigured, resendFromAddress } from "@/lib/email/resend";
import { marketingEmail } from "@/lib/email/templates";
import { unsubscribePostUrl, unsubscribeUrl } from "@/lib/email/unsubscribe";
import { firstNameForEmail, loadUsers, type AdminUser } from "./data";

/** Replies to every email sent from the admin area land here. */
export const ADMIN_REPLY_TO = process.env.ADMIN_EMAIL_REPLY_TO?.trim() || "keith@apsurn.com";

export interface ComposedEmail {
  subject: string;
  title: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  preheader?: string;
}

function fill(text: string, user: Pick<AdminUser, "name" | "email">): string {
  return text.replace(/\{\{\s*first_name\s*\}\}/gi, firstNameForEmail(user));
}

export function renderFor(email: ComposedEmail, user: Pick<AdminUser, "name" | "email">, opts: { unsubscribeUrl?: string }) {
  return marketingEmail({
    preheader: email.preheader ? fill(email.preheader, user) : undefined,
    title: fill(email.title, user),
    body: fill(email.body, user),
    ctaLabel: email.ctaLabel,
    ctaUrl: email.ctaUrl,
    unsubscribeUrl: opts.unsubscribeUrl,
  });
}

/** Everyone with an account and an email who has not unsubscribed from product emails. */
export async function broadcastAudience(): Promise<AdminUser[]> {
  const { users } = await loadUsers();
  const db = createAdminClient();
  const { data } = await db.from("email_preferences").select("user_id").eq("marketing_opt_out", true);
  const out = new Set((data ?? []).map((row) => String(row.user_id)));
  return users.filter((user) => user.email && !out.has(user.id));
}

export interface SendResult {
  emailId: string | null;
  recipients: number;
  sent: number;
  failed: number;
  error?: string;
}

const BATCH = 100;

export async function sendAdminEmail(params: {
  kind: "broadcast" | "individual" | "test";
  email: ComposedEmail;
  recipients: AdminUser[];
  createdBy: string;
}): Promise<SendResult> {
  if (!isResendConfigured()) return { emailId: null, recipients: params.recipients.length, sent: 0, failed: 0, error: "RESEND_API_KEY is not configured." };
  if (params.recipients.length === 0) return { emailId: null, recipients: 0, sent: 0, failed: 0, error: "No recipients." };

  const db = createAdminClient();
  const marketing = params.kind === "broadcast";
  const sample = renderFor(params.email, { name: "Alex", email: "alex@example.com" }, {});
  const { data: log, error: logError } = await db
    .from("admin_emails")
    .insert({
      kind: params.kind,
      subject: params.email.subject,
      html: sample.html,
      audience: marketing ? "all users" : params.recipients.map((r) => r.email).join(", ").slice(0, 300),
      recipient_count: params.recipients.length,
      created_by: params.createdBy,
    })
    .select("id")
    .single();
  if (logError || !log) {
    return { emailId: null, recipients: params.recipients.length, sent: 0, failed: 0, error: logError?.message ?? "Could not log the email. Apply migration 0037." };
  }
  const emailId = log.id as string;
  await db.from("admin_email_recipients").insert(params.recipients.map((r) => ({ email_id: emailId, user_id: r.id, email: r.email })));

  const client = getResendClient();
  let sent = 0;
  let failed = 0;
  let lastError: string | undefined;
  for (let i = 0; i < params.recipients.length; i += BATCH) {
    const chunk = params.recipients.slice(i, i + BATCH);
    const payloads = chunk.map((user) => {
      const rendered = renderFor(params.email, user, { unsubscribeUrl: marketing ? unsubscribeUrl(user.id) : undefined });
      return {
        from: resendFromAddress(),
        to: [user.email],
        subject: fill(params.email.subject, user),
        html: rendered.html,
        text: rendered.text,
        replyTo: ADMIN_REPLY_TO,
        ...(marketing
          ? { headers: { "List-Unsubscribe": `<${unsubscribePostUrl(user.id)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }
          : {}),
      };
    });
    try {
      const { error } = await client.batch.send(payloads);
      if (error) throw new Error(error.message || "Resend rejected the batch");
      sent += chunk.length;
      await db.from("admin_email_recipients").update({ status: "sent", sent_at: new Date().toISOString() }).eq("email_id", emailId).in("user_id", chunk.map((u) => u.id));
    } catch (error) {
      failed += chunk.length;
      lastError = error instanceof Error ? error.message : "Send failed";
      await db.from("admin_email_recipients").update({ status: "failed", error: lastError.slice(0, 300) }).eq("email_id", emailId).in("user_id", chunk.map((u) => u.id));
    }
  }
  await db.from("admin_emails").update({ sent_count: sent, failed_count: failed, finished_at: new Date().toISOString() }).eq("id", emailId);
  return { emailId, recipients: params.recipients.length, sent, failed, ...(lastError ? { error: lastError } : {}) };
}
