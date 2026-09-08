import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendResendEmail } from "@/lib/email/resend";

const schema = z.object({ email: z.string().trim().email().max(320), requestType: z.enum(["access", "correct", "delete", "suppress"]), details: z.string().trim().max(1000).optional() });
export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid privacy request" }, { status: 400 });
  const db = createAdminClient();
  const since = new Date(Date.now() - 86400_000).toISOString();
  const { count } = await db.from("privacy_requests").select("id", { count: "exact", head: true }).eq("email", parsed.data.email.toLowerCase()).gte("created_at", since);
  if ((count ?? 0) >= 3) return NextResponse.json({ error: "Too many recent requests" }, { status: 429 });
  const { data, error } = await db.from("privacy_requests").insert({ email: parsed.data.email.toLowerCase(), request_type: parsed.data.requestType, details: parsed.data.details }).select("id").single();
  if (error || !data) return NextResponse.json({ error: "Could not record request" }, { status: 500 });
  await sendResendEmail({ to: process.env.PRIVACY_TEAM_EMAIL ?? "privacy@apsurn.com", subject: `Privacy request ${data.id}`, text: `${parsed.data.requestType} request from ${parsed.data.email}\n\n${parsed.data.details ?? ""}`, html: `<p>${parsed.data.requestType} request from ${parsed.data.email}</p><p>Reference: ${data.id}</p>` }).catch((sendError) => console.error("[privacy] notification failed", sendError));
  return NextResponse.json({ requestId: data.id }, { status: 202 });
}
