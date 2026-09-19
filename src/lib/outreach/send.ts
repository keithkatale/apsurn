import { sendGmailMessage, type ConnectedInbox } from "@/lib/inbox/gmail";

export interface SendPayload {
  to: string;
  subject: string;
  body: string;
  threadId?: string | null;
}

export async function sendViaInbox(inbox: ConnectedInbox, payload: SendPayload) {
  return sendGmailMessage(inbox, payload);
}
