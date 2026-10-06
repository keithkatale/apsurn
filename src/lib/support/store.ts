import { createAdminClient } from "@/lib/supabase/admin";
import { sendResendEmail } from "@/lib/email/resend";
import { appOrigin, supportAlertEmail, supportReplyEmail } from "@/lib/email/templates";

export const SUPPORT_INBOX = "hello@apsurn.com";

export type SupportStatus = "open" | "needs_human" | "answered" | "closed";

export type SupportConversation = {
  id: string;
  visitor_id: string;
  user_id: string | null;
  email: string | null;
  status: SupportStatus;
  human_joined: boolean;
  needs_email: boolean;
  last_message_at: string;
  emailed_upto: string | null;
  visitor_last_seen_at: string | null;
  admin_last_read_at: string | null;
  created_at: string;
};

export type SupportMessage = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "admin";
  content: string;
  created_at: string;
};

const db = () => createAdminClient();

/** A visitor may only touch a conversation when the id and their private visitor id both match. */
export async function getOwnedConversation(id: string, visitorId: string): Promise<SupportConversation | null> {
  const { data } = await db()
    .from("support_conversations")
    .select("*")
    .eq("id", id)
    .eq("visitor_id", visitorId)
    .maybeSingle();
  return (data as SupportConversation | null) ?? null;
}

export async function createConversation(params: {
  visitorId: string;
  userId: string | null;
  email: string | null;
}): Promise<SupportConversation> {
  const { data, error } = await db()
    .from("support_conversations")
    .insert({ visitor_id: params.visitorId, user_id: params.userId, email: params.email })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message || "Could not start conversation");
  return data as SupportConversation;
}

export async function addMessage(
  conversationId: string,
  role: SupportMessage["role"],
  content: string,
): Promise<SupportMessage> {
  const { data, error } = await db()
    .from("support_messages")
    .insert({ conversation_id: conversationId, role, content })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message || "Could not save message");
  await db().from("support_conversations").update({ last_message_at: data.created_at }).eq("id", conversationId);
  return data as SupportMessage;
}

export async function listMessages(conversationId: string, after?: string | null): Promise<SupportMessage[]> {
  let query = db().from("support_messages").select("*").eq("conversation_id", conversationId);
  if (after) query = query.gt("created_at", after);
  const { data } = await query.order("created_at", { ascending: true }).limit(500);
  return (data ?? []) as SupportMessage[];
}

export async function updateConversation(id: string, patch: Partial<SupportConversation>) {
  await db().from("support_conversations").update(patch).eq("id", id);
}

function who(conversation: SupportConversation) {
  if (conversation.email) return `${conversation.email}${conversation.user_id ? " (signed in)" : " (not signed in)"}`;
  return conversation.user_id ? "Guest session (no personal email yet)" : "Anonymous visitor (no email yet)";
}

/** Emails the support inbox. Never throws: support must keep working if email is down. */
export async function notifyAdmin(params: {
  conversation: SupportConversation;
  subject: string;
  intro: string;
  messages: SupportMessage[];
}) {
  const { conversation, messages } = params;
  const { html, text } = supportAlertEmail({
    intro: params.intro,
    from: who(conversation),
    adminUrl: `${appOrigin()}/admin/support?id=${conversation.id}`,
    messages,
  });
  try {
    await sendResendEmail({
      to: SUPPORT_INBOX,
      subject: params.subject,
      html,
      text,
      replyTo: conversation.email ?? undefined,
    });
  } catch (error) {
    console.error("[support] admin email failed", error instanceof Error ? error.message : error);
  }
}

/** Sends everything not yet emailed to the support inbox, once. */
export async function emailTranscript(conversation: SupportConversation, subjectPrefix = "Support chat") {
  const fresh = await listMessages(conversation.id, conversation.emailed_upto);
  if (fresh.length === 0) return false;
  await updateConversation(conversation.id, { emailed_upto: fresh[fresh.length - 1].created_at });
  await notifyAdmin({
    conversation,
    subject: `${subjectPrefix}: ${conversation.email ?? "visitor"}`,
    intro: "A support conversation ended or was left. Transcript of the new messages:",
    messages: fresh,
  });
  return true;
}

export async function emailVisitor(conversation: SupportConversation, content: string) {
  if (!conversation.email) return;
  const reply = supportReplyEmail({ content });
  try {
    await sendResendEmail({
      to: conversation.email,
      subject: "A reply from the Apsurn team",
      text: reply.text,
      html: reply.html,
      replyTo: SUPPORT_INBOX,
    });
  } catch (error) {
    console.error("[support] visitor email failed", error instanceof Error ? error.message : error);
  }
}
