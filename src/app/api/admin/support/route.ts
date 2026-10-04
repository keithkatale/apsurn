import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminForApi } from "@/lib/support/admin-api";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requireAdminForApi();
  if (denied) return denied;

  const db = createAdminClient();
  const { data: conversations } = await db
    .from("support_conversations")
    .select("*")
    .order("last_message_at", { ascending: false })
    .limit(200);
  const rows = conversations ?? [];
  const ids = rows.map((c) => c.id);

  const last = new Map<string, { role: string; content: string; created_at: string }>();
  if (ids.length) {
    const { data: messages } = await db
      .from("support_messages")
      .select("conversation_id, role, content, created_at")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false })
      .limit(2000);
    for (const m of messages ?? []) if (!last.has(m.conversation_id)) last.set(m.conversation_id, m);
  }

  return NextResponse.json({
    conversations: rows.map((c) => {
      const lastMessage = last.get(c.id) ?? null;
      const unread =
        lastMessage?.role === "user" &&
        (!c.admin_last_read_at || new Date(c.admin_last_read_at) < new Date(lastMessage.created_at));
      return {
        id: c.id,
        email: c.email,
        signedIn: Boolean(c.user_id),
        status: c.status,
        needsEmail: c.needs_email,
        lastMessageAt: c.last_message_at,
        lastMessage: lastMessage ? { role: lastMessage.role, content: lastMessage.content.slice(0, 140) } : null,
        unread,
      };
    }),
  });
}
