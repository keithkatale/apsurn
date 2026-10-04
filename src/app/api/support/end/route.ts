import { NextRequest, NextResponse } from "next/server";
import { VISITOR_ID } from "@/lib/support/identity";
import { emailTranscript, getOwnedConversation } from "@/lib/support/store";

export const runtime = "nodejs";

/** Called when the visitor closes the chat or leaves the page (often via sendBeacon). Emails the new messages once. */
export async function POST(request: NextRequest) {
  let body: { conversationId?: string; visitorId?: string } = {};
  try {
    body = JSON.parse(await request.text());
  } catch {
    /* fall through to validation */
  }
  if (!body.conversationId || !body.visitorId || !VISITOR_ID.test(body.visitorId)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const conversation = await getOwnedConversation(body.conversationId, body.visitorId);
  if (!conversation) return NextResponse.json({ ok: true });
  const sent = await emailTranscript(conversation);
  return NextResponse.json({ ok: true, sent });
}
