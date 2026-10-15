import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AdminAccessError, requireAdminUser } from "@/lib/auth/admin";
import { AuthenticationError } from "@/lib/auth/session";
import { loadUsers } from "@/lib/admin/data";
import { ADMIN_REPLY_TO, broadcastAudience, renderFor, sendAdminEmail } from "@/lib/admin/send-email";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({
  action: z.enum(["preview", "audience", "send"]),
  mode: z.enum(["broadcast", "individual", "test"]).default("broadcast"),
  userId: z.string().uuid().optional(),
  subject: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10_000),
  ctaLabel: z.string().trim().max(60).optional(),
  ctaUrl: z.string().trim().max(500).optional(),
  preheader: z.string().trim().max(200).optional(),
});

/** Preview, count the audience, or send an email from the admin area. Replies land at ADMIN_REPLY_TO. */
export async function POST(request: NextRequest) {
  let admin: { id: string; email: string };
  try {
    admin = await requireAdminUser();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
    if (error instanceof AdminAccessError) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    throw error;
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Fill in a subject, a headline and the message." }, { status: 400 });
  const input = parsed.data;
  if (input.ctaUrl && !/^https?:\/\//i.test(input.ctaUrl)) return NextResponse.json({ error: "The button link must start with https://" }, { status: 400 });
  if (Boolean(input.ctaLabel) !== Boolean(input.ctaUrl)) return NextResponse.json({ error: "A button needs both a label and a link." }, { status: 400 });

  const email = { subject: input.subject, title: input.title, body: input.body, ctaLabel: input.ctaLabel, ctaUrl: input.ctaUrl, preheader: input.preheader };

  if (input.action === "preview") {
    const rendered = renderFor(email, { name: "Alex Morgan", email: "alex@example.com" }, { unsubscribeUrl: input.mode === "broadcast" ? "#" : undefined });
    return NextResponse.json({ html: rendered.html });
  }

  if (input.action === "audience") {
    const audience = await broadcastAudience();
    return NextResponse.json({ count: audience.length, replyTo: ADMIN_REPLY_TO });
  }

  try {
    if (input.mode === "test") {
      const me = { id: admin.id, email: admin.email, name: "Keith", createdAt: "", lastSignInAt: null, guest: false };
      return NextResponse.json(await sendAdminEmail({ kind: "test", email, recipients: [me], createdBy: admin.email }));
    }
    if (input.mode === "individual") {
      if (!input.userId) return NextResponse.json({ error: "Pick a user." }, { status: 400 });
      const { users } = await loadUsers();
      const user = users.find((u) => u.id === input.userId);
      if (!user?.email) return NextResponse.json({ error: "That user has no email." }, { status: 404 });
      return NextResponse.json(await sendAdminEmail({ kind: "individual", email, recipients: [user], createdBy: admin.email }));
    }
    const recipients = await broadcastAudience();
    return NextResponse.json(await sendAdminEmail({ kind: "broadcast", email, recipients, createdBy: admin.email }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not send." }, { status: 500 });
  }
}
