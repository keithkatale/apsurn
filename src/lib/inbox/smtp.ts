import nodemailer from "nodemailer";
import { htmlToPlain, sanitizeEmailHtml, wrapEmailHtml } from "@/lib/outreach/email-html";
import { decryptToken } from "./token-crypto";
import type { ConnectedInbox, GmailSendResult } from "./gmail";

export const SMTP_SCOPE = "smtp";

function normalizeAppPassword(value: string) {
  return value.replace(/\s+/g, "").trim();
}

function gmailTransport(email: string, appPassword: string) {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: email,
      pass: normalizeAppPassword(appPassword),
    },
  });
}

export async function verifyGmailSmtp(email: string, appPassword: string) {
  const transport = gmailTransport(email, appPassword);
  try {
    await transport.verify();
  } catch (error) {
    const detail = error instanceof Error ? error.message : "SMTP login failed";
    if (/invalid login|badcredentials|username and password|535/i.test(detail)) {
      throw new Error(
        "Gmail rejected that password. Create a 16-character App Password (Google Account → Security → 2-Step Verification → App passwords), not your normal Gmail password.",
      );
    }
    throw new Error(detail);
  } finally {
    transport.close();
  }
}

export async function sendSmtpMessage(
  inbox: ConnectedInbox,
  opts: { to: string; subject: string; body: string; threadId?: string | null },
): Promise<GmailSendResult> {
  const password = decryptToken(inbox.refresh_token_enc);
  const transport = gmailTransport(inbox.email_address, password);
  const plain = htmlToPlain(opts.body) || opts.body;
  const html = wrapEmailHtml(sanitizeEmailHtml(opts.body));
  try {
    const info = await transport.sendMail({
      from: inbox.email_address,
      to: opts.to,
      subject: opts.subject,
      text: plain,
      html,
      ...(opts.threadId ? { inReplyTo: opts.threadId, references: opts.threadId } : {}),
    });
    const id = typeof info.messageId === "string" && info.messageId ? info.messageId : `smtp-${Date.now()}`;
    return { providerMessageId: id, threadId: opts.threadId || id };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "SMTP send failed";
    if (/invalid login|badcredentials|username and password|535/i.test(detail)) {
      throw new Error("Gmail SMTP login failed. Reconnect with a new App Password in Settings.");
    }
    throw new Error(detail);
  } finally {
    transport.close();
  }
}
