import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminForApi } from "@/lib/support/admin-api";
import { addMessage, emailVisitor, listMessages, updateConversation, type SupportConversation } from "@/lib/support/store";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

async function load(id: string): Promise<SupportConversation | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await createAdminClient().from("support_conversations").select("*").eq("id", id).maybeSingle();
  return (data as SupportConversation | null) ?? null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminForApi();
  if (denied) return denied;
  const { id } = await params;
  const conversation = await load(id);
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const after = request.nextUrl.searchParams.get("after");
  const messages = await listMessages(id, after && !Number.isNaN(Date.parse(after)) ? after : null);
  await updateConversation(id, { admin_last_read_at: new Date().toISOString() });
  return NextResponse.json({
    conversation: {
      id: conversation.id,
      email: conversation.email,
      signedIn: Boolean(conversation.user_id),
      status: conversation.status,
      needsEmail: conversation.needs_email,
      createdAt: conversation.created_at,
    },
    messages,
  });
}

const replySchema = z.object({ content: z.string().trim().min(1).max(4000) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminForApi();
  if (denied) return denied;
  const { id } = await params;
  const conversation = await load(id);
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = replySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const message = await addMessage(id, "admin", parsed.data.content);
  await updateConversation(id, { human_joined: true, status: "answered", admin_last_read_at: message.created_at });

  // If the customer isn't looking at the chat right now, make sure the reply still reaches them.
  const seen = conversation.visitor_last_seen_at ? Date.now() - Date.parse(conversation.visitor_last_seen_at) : Infinity;
  if (seen > 90_000) await emailVisitor(conversation, parsed.data.content);

  return NextResponse.json({ message });
}

const patchSchema = z.object({ status: z.enum(["open", "closed"]) });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminForApi();
  if (denied) return denied;
  const { id } = await params;
  const conversation = await load(id);
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  await updateConversation(id, {
    status: parsed.data.status === "closed" ? "closed" : conversation.human_joined ? "answered" : "open",
  });
  return NextResponse.json({ ok: true });
}
