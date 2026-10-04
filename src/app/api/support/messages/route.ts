import { NextRequest, NextResponse } from "next/server";
import { VISITOR_ID } from "@/lib/support/identity";
import { getOwnedConversation, listMessages, updateConversation } from "@/lib/support/store";

export const runtime = "nodejs";

/** Visitor polls this to restore a conversation and to receive admin replies. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const id = params.get("conversationId") ?? "";
  const visitorId = params.get("visitorId") ?? "";
  const after = params.get("after");
  if (!VISITOR_ID.test(visitorId) || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const conversation = await getOwnedConversation(id, visitorId);
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await updateConversation(id, { visitor_last_seen_at: new Date().toISOString() });
  const messages = await listMessages(id, after && !Number.isNaN(Date.parse(after)) ? after : null);
  return NextResponse.json({
    messages,
    status: conversation.status,
    needsEmail: conversation.needs_email,
  });
}
