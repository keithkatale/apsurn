import { google } from "googleapis";
import { createAdminClient } from "@/lib/supabase/admin";
import { htmlToPlain, sanitizeEmailHtml, wrapEmailHtml } from "@/lib/outreach/email-html";
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
  scopes?: string[] | null;
}

/** App-password SMTP inbox — works before Google OAuth verification is approved. */
export function inboxUsesSmtp(inbox: Pick<ConnectedInbox, "scopes">): boolean {
  return (inbox.scopes ?? []).includes("smtp");
}

function oauthClient() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET not configured");
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export const GMAIL_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function gmailAuthUrl(state: string) {
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GMAIL_OAUTH_SCOPES,
    state,
    include_granted_scopes: true,
  });
}

export async function exchangeGmailCode(code: string) {
  const oauth2 = oauthClient();
  const { tokens } = await oauth2.getToken(code);
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("Gmail did not return access and refresh tokens. Reconnect and approve offline access.");
  }
  oauth2.setCredentials(tokens);
  const oauthApi = google.oauth2({ version: "v2", auth: oauth2 });
  const { data: profile } = await oauthApi.userinfo.get();
  const email = profile.email?.trim();
  if (!email) throw new Error("Gmail did not return an email address");
  return {
    email,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiryDate: tokens.expiry_date ?? null,
    scopes: typeof tokens.scope === "string" ? tokens.scope.split(/\s+/).filter(Boolean) : GMAIL_OAUTH_SCOPES,
  };
}

function gmailApiError(error: unknown): Error {
  const payload = error as {
    message?: string;
    response?: { data?: { error?: string | { message?: string; status?: string } } };
  };
  const nested = payload.response?.data?.error;
  const detail =
    typeof nested === "string"
      ? nested
      : nested?.message || payload.message || (error instanceof Error ? error.message : "Gmail send failed");
  if (/invalid_grant|expired or revoked/i.test(detail)) {
    return new Error("Gmail access expired. Reconnect Gmail in Settings.");
  }
  if (/insufficient|accessNotConfigured|Gmail API has not been used|Daily Limit/i.test(detail)) {
    return new Error("Gmail could not send. Enable the Gmail API on this Google Cloud project, then reconnect Gmail.");
  }
  return new Error(detail);
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

  try {
    const token = await oauth2.getAccessToken();
    const nextAccess = typeof token === "string" ? token : token?.token;
    if (!nextAccess) throw new Error("Gmail token refresh failed");
    const credentials = oauth2.credentials;
    const db = createAdminClient();
    await db
      .from("connected_inboxes")
      .update({
        access_token_enc: encryptToken(nextAccess),
        refresh_token_enc: credentials.refresh_token
          ? encryptToken(credentials.refresh_token)
          : inbox.refresh_token_enc,
        token_expires_at: credentials.expiry_date
          ? new Date(credentials.expiry_date).toISOString()
          : null,
        status: "connected",
      })
      .eq("id", inbox.id);
    return nextAccess;
  } catch (error) {
    throw gmailApiError(error);
  }
}

function toBase64Url(raw: string): string {
  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function encodeSubject(subject: string): string {
  if (/^[\x20-\x7E]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

function isGmailThreadId(value?: string | null): value is string {
  return Boolean(value && /^[0-9a-f]+$/i.test(value) && !value.includes("-"));
}

function buildRawMessage(opts: {
  from: string;
  to: string;
  subject: string;
  body: string;
  threadId?: string | null;
  inReplyTo?: string | null;
}): string {
  const plain = htmlToPlain(opts.body) || opts.body;
  const html = wrapEmailHtml(sanitizeEmailHtml(opts.body));
  const boundary = `apsurn_${Date.now().toString(36)}`;
  const lines = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${encodeSubject(opts.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  if (opts.inReplyTo) {
    lines.push(`In-Reply-To: ${opts.inReplyTo}`);
    lines.push(`References: ${opts.inReplyTo}`);
  }
  lines.push(
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(plain, "utf8").toString("base64"),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(html, "utf8").toString("base64"),
    `--${boundary}--`,
  );
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
  const threadId = isGmailThreadId(opts.threadId) ? opts.threadId : undefined;

  const raw = buildRawMessage({
    from: inbox.email_address,
    to: opts.to,
    subject: opts.subject,
    body: opts.body,
    threadId,
  });

  try {
    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw,
        ...(threadId ? { threadId } : {}),
      },
    });

    const id = response.data.id;
    const nextThreadId = response.data.threadId;
    if (!id || !nextThreadId) throw new Error("Gmail send returned no message id");
    return { providerMessageId: id, threadId: nextThreadId };
  } catch (error) {
    throw gmailApiError(error);
  }
}
