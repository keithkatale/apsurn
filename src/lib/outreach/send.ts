import { inboxUsesSmtp, sendGmailMessage, type ConnectedInbox } from "@/lib/inbox/gmail";
import { sendSmtpMessage } from "@/lib/inbox/smtp";

export interface SendPayload {
  to: string;
  subject: string;
  body: string;
  threadId?: string | null;
}

export async function sendViaInbox(inbox: ConnectedInbox, payload: SendPayload) {
  if (inboxUsesSmtp(inbox)) {
    return sendSmtpMessage(inbox, payload);
  }
  return sendGmailMessage(inbox, payload);
}
