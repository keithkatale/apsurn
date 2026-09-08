import { Resend } from "resend";

// Platform transactional email only (welcome, password reset, sequence
// alerts). Outbound cold-outreach sends go through the user's own connected
// inbox (see src/lib/inbox), never through this.

let cached: Resend | null = null;

export function isResendConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export function getResendClient() {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) throw new Error("RESEND_API_KEY is not configured");
  if (!cached) cached = new Resend(key);
  return cached;
}

export function resendFromAddress() {
  return process.env.RESEND_FROM_EMAIL?.trim() || "Apsurn <noreply@mail.apsurn.com>";
}

export async function sendResendEmail(params: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  from?: string;
}) {
  if (!isResendConfigured()) {
    console.warn("[email] RESEND_API_KEY missing — skip send:", params.subject);
    return { skipped: true as const };
  }

  const to = (Array.isArray(params.to) ? params.to : [params.to])
    .map((e) => e.trim())
    .filter(Boolean);
  if (!to.length) return { skipped: true as const };

  const client = getResendClient();
  const { data, error } = await client.emails.send({
    from: params.from?.trim() || resendFromAddress(),
    to,
    subject: params.subject,
    html: params.html,
    text: params.text,
    replyTo: params.replyTo,
  });

  if (error) {
    console.error("[email] Resend error", error);
    throw new Error(error.message || "Failed to send email");
  }
  return { skipped: false as const, id: data?.id ?? null };
}
