import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { EMAIL, VISITOR_ID } from "@/lib/support/identity";
import { addMessage, getOwnedConversation, listMessages, notifyAdmin, updateConversation } from "@/lib/support/store";

export const runtime = "nodejs";

const bodySchema = z.object({
  conversationId: z.string().uuid(),
  visitorId: z.string().regex(VISITOR_ID),
  email: z.string().trim().max(200).regex(EMAIL),
});

/** A signed-out visitor leaves an email so the team can reach them. */
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  const { conversationId, visitorId, email } = parsed.data;

  const conversation = await getOwnedConversation(conversationId, visitorId);
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await updateConversation(conversationId, { email, needs_email: false });
  const reply = await addMessage(
    conversationId,
    "assistant",
    `Thanks. Our team will email you at ${email} right away. You can keep chatting here in the meantime.`,
  );
  const recent = (await listMessages(conversationId)).slice(-12);
  await notifyAdmin({
    conversation: { ...conversation, email },
    subject: `Contact email left: ${email}`,
    intro: "A visitor who asked for a person has now left their email.",
    messages: recent,
  });
  return NextResponse.json({ messages: [reply], needsEmail: false });
}
