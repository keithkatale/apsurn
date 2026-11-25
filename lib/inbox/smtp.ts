import nodemailer from 'nodemailer'
import { htmlToPlain, plainToEmailHtml, sanitizeEmailHtml, wrapEmailHtml } from '@/lib/outreach/email-html'
import { decryptToken } from './token-crypto'

export const SMTP_SCOPE = 'smtp'

export interface ConnectedInbox {
  id: string
  user_id: string
  provider: string
  email_address: string
  access_token_enc: string
  refresh_token_enc: string
  token_expires_at: string | null
  status: string
  scopes?: string[] | null
}

export interface SmtpSendResult {
  providerMessageId: string
  threadId: string
}

function normalizeAppPassword(value: string) {
  return value.replace(/\s+/g, '').trim()
}

function gmailTransport(email: string, appPassword: string) {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: email,
      pass: normalizeAppPassword(appPassword),
    },
  })
}

const LOGIN_REJECTED = /invalid login|badcredentials|username and password|535/i

/** Checks the Gmail address + App Password against smtp.gmail.com before we store anything. */
export async function verifyGmailSmtp(email: string, appPassword: string) {
  const transport = gmailTransport(email, appPassword)
  try {
    await transport.verify()
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'SMTP login failed'
    if (LOGIN_REJECTED.test(detail)) {
      throw new Error(
        'Gmail rejected that password. Create a 16-character App Password (Google Account → Security → 2-Step Verification → App passwords), not your normal Gmail password.',
      )
    }
    throw new Error(detail)
  } finally {
    transport.close()
  }
}

export async function sendSmtpMessage(
  inbox: ConnectedInbox,
  opts: { to: string; subject: string; body: string; threadId?: string | null },
): Promise<SmtpSendResult> {
  const password = decryptToken(inbox.refresh_token_enc)
  const transport = gmailTransport(inbox.email_address, password)
  const plain = htmlToPlain(opts.body) || opts.body
  // Plain-text bodies must become paragraph blocks, or the HTML part collapses every line break.
  const html = wrapEmailHtml(sanitizeEmailHtml(plainToEmailHtml(opts.body)))
  try {
    const info = await transport.sendMail({
      from: inbox.email_address,
      to: opts.to,
      subject: opts.subject,
      text: plain,
      html,
      ...(opts.threadId ? { inReplyTo: opts.threadId, references: opts.threadId } : {}),
    })
    const id = typeof info.messageId === 'string' && info.messageId ? info.messageId : `smtp-${Date.now()}`
    return { providerMessageId: id, threadId: opts.threadId || id }
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'SMTP send failed'
    if (LOGIN_REJECTED.test(detail)) {
      throw new Error('Gmail SMTP login failed. Reconnect with a new App Password in Settings.')
    }
    throw new Error(detail)
  } finally {
    transport.close()
  }
}
