import { google } from "googleapis";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken, encryptToken } from "./token-crypto";

export interface ConnectedInbox {
  id: string;
  user_id: string;
  provider: string;
  email_address: string;
  access_token_enc: string;
  refresh_token_enc: string;
  token_expires_at: string | null;
  status: string;
}

function oauthClient() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET not configured");
  }
  return new google.auth.OAuth2(clientId, clientSecret);
}

async function accessTokenFor(inbox: ConnectedInbox): Promise<string> {
  const oauth2 = oauthClient();
  const access = decryptToken(inbox.access_token_enc);
  const refresh = decryptToken(inbox.refresh_token_enc);
  oauth2.setCredentials({
    access_token: access,
    refresh_token: refresh,
    expiry_date: inbox.token_expires_at ? Date.parse(inbox.token_expires_at) : undefined,
  });

  const expiry = inbox.token_expires_at ? Date.parse(inbox.token_expires_at) : 0;
  if (expiry && expiry > Date.now() + 60_000) {
    return access;
  }

  const { credentials } = await oauth2.refreshAccessToken();
  if (!credentials.access_token) throw new Error("Gmail token refresh failed");

  const db = createAdminClient();
  await db
    .from("connected_inboxes")
    .update({
      access_token_enc: encryptToken(credentials.access_token),
      refresh_token_enc: credentials.refresh_token
        ? encryptToken(credentials.refresh_token)
        : inbox.refresh_token_enc,
      token_expires_at: credentials.expiry_date
        ? new Date(credentials.expiry_date).toISOString()
        : null,
      status: "connected",
    })
    .eq("id", inbox.id);

  return credentials.access_token;
}

function toBase64Url(raw: string): string {
  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildRawMessage(opts: {
  from: string;
  to: string;
  subject: string;
  body: string;
  threadId?: string | null;
  inReplyTo?: string | null;
}): string {
  const lines = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
  ];
  if (opts.inReplyTo) {
    lines.push(`In-Reply-To: ${opts.inReplyTo}`);
    lines.push(`References: ${opts.inReplyTo}`);
  }
  lines.push("", opts.body);
  return toBase64Url(lines.join("\r\n"));
}

export interface GmailSendResult {
  providerMessageId: string;
  threadId: string;
}

export async function sendGmailMessage(
  inbox: ConnectedInbox,
  opts: { to: string; subject: string; body: string; threadId?: string | null }
): Promise<GmailSendResult> {
  if (inbox.provider !== "gmail") {
    throw new Error(`Unsupported inbox provider: ${inbox.provider}`);
  }

  const token = await accessTokenFor(inbox);
  const oauth2 = oauthClient();
  oauth2.setCredentials({ access_token: token });
  const gmail = google.gmail({ version: "v1", auth: oauth2 });

  const raw = buildRawMessage({
    from: inbox.email_address,
    to: opts.to,
    subject: opts.subject,
    body: opts.body,
    threadId: opts.threadId,
  });

  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw,
      ...(opts.threadId ? { threadId: opts.threadId } : {}),
    },
  });

  const id = response.data.id;
  const threadId = response.data.threadId;
  if (!id || !threadId) throw new Error("Gmail send returned no message id");
  return { providerMessageId: id, threadId };
}
