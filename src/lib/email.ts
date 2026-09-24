import { logger } from '@/lib/logger'
import { maskEmail } from '@/lib/text'

// Read the optional Resend config from process.env directly (not the validated env module) so this
// adapter never forces env validation at build time - email is an optional integration.

/**
 * Email delivery. When RESEND_API_KEY + EMAIL_FROM are set the message is sent through Resend's HTTP
 * API (no SDK dependency); otherwise the adapter only records intent so local development works with
 * no provider. A send failure is logged, never thrown - a slow or down mail provider must not break
 * the request that triggered it.
 *
 * PRIVACY (SEC-P02, BR-L04): logs never contain plaintext PII or tokens. The recipient is masked, and
 * the token-bearing link is written only in development, never in production.
 */
const LOG_LINKS = process.env.NODE_ENV !== 'production'
const RESEND_ENDPOINT = 'https://api.resend.com/emails'
// Two optional providers: Gmail/SMTP (send FROM your own mailbox) takes precedence over Resend.
const smtpEnabled = Boolean(process.env.SMTP_USER && process.env.SMTP_PASS)
const resendEnabled = Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
const emailEnabled = smtpEnabled || resendEnabled

async function deliver(args: {
  to: string
  subject: string
  html: string
  event: string
  /** The link inside the email; logged only in development when no provider is configured. */
  devLink?: string
}): Promise<void> {
  if (!emailEnabled) {
    logger.info(args.event, {
      to: maskEmail(args.to),
      delivered: false,
      ...(LOG_LINKS && args.devLink ? { link: args.devLink } : {}),
    })
    return
  }
  try {
    if (smtpEnabled) {
      // Gmail/SMTP: send from the studio's own mailbox (SMTP_USER) using an app password. Gmail requires
      // the "from" to be that authenticated account (or an alias), so it defaults to SMTP_USER.
      const nodemailer = (await import('nodemailer')).default
      const port = Number(process.env.SMTP_PORT ?? '465')
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
        port,
        secure: port === 465,
        auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
      })
      await transporter.sendMail({
        from: process.env.EMAIL_FROM ?? process.env.SMTP_USER!,
        to: args.to,
        subject: args.subject,
        html: args.html,
      })
      logger.info(args.event, { to: maskEmail(args.to), delivered: true, via: 'smtp' })
      return
    }
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: args.to, subject: args.subject, html: args.html }),
    })
    if (!res.ok) {
      logger.error(`${args.event}.failed`, { to: maskEmail(args.to), status: res.status })
      return
    }
    logger.info(args.event, { to: maskEmail(args.to), delivered: true, via: 'resend' })
  } catch (error) {
    logger.error(`${args.event}.error`, {
      to: maskEmail(args.to),
      message: error instanceof Error ? error.message : 'unknown',
    })
  }
}

/**
 * Send one email and REPORT the outcome (docs/25 Part 4). Unlike {@link deliver}, this returns the
 * provider result so a NotificationDispatch can record its send-state. The same `idempotencyKey`
 * (derived from the dispatch's dedupeKey) is sent on every retry so Resend dedupes within 24h (Rule N4).
 * With no provider configured it returns SKIPPED_NO_PROVIDER — never a fake "sent" (Rule N9).
 */
export type SendResult =
  | { outcome: 'ACCEPTED'; providerMessageId: string | null }
  | { outcome: 'FAILED' }
  | { outcome: 'SKIPPED_NO_PROVIDER' }

export async function sendEmailWithResult(args: {
  to: string
  subject: string
  html: string
  idempotencyKey: string
}): Promise<SendResult> {
  if (!emailEnabled) return { outcome: 'SKIPPED_NO_PROVIDER' }
  try {
    if (smtpEnabled) {
      const nodemailer = (await import('nodemailer')).default
      const port = Number(process.env.SMTP_PORT ?? '465')
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
        port,
        secure: port === 465,
        auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
      })
      const info = await transporter.sendMail({
        from: process.env.EMAIL_FROM ?? process.env.SMTP_USER!,
        to: args.to,
        subject: args.subject,
        html: args.html,
      })
      logger.info('notification.send.accepted', { to: maskEmail(args.to), via: 'smtp' })
      return { outcome: 'ACCEPTED', providerMessageId: info.messageId ?? null }
    }
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': args.idempotencyKey,
      },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: args.to, subject: args.subject, html: args.html }),
    })
    if (!res.ok) {
      logger.error('notification.send.failed', { to: maskEmail(args.to), status: res.status })
      return { outcome: 'FAILED' }
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string }
    logger.info('notification.send.accepted', { to: maskEmail(args.to) })
    return { outcome: 'ACCEPTED', providerMessageId: data.id ?? null }
  } catch (error) {
    logger.error('notification.send.error', { to: maskEmail(args.to), message: error instanceof Error ? error.message : 'unknown' })
    return { outcome: 'FAILED' }
  }
}

function shell(title: string, body: string): string {
  return `<div style="font-family:Helvetica,Arial,sans-serif;color:#20201e;max-width:520px;margin:0 auto;padding:24px">
    <div style="font-family:Georgia,serif;font-size:20px;letter-spacing:2px;text-transform:uppercase">Moments</div>
    <h1 style="font-family:Georgia,serif;font-size:22px;font-weight:600;margin:20px 0 12px">${title}</h1>
    ${body}
    <p style="color:#9c948b;font-size:13px;margin-top:28px">Moments Photography and Film, Sydney.</p>
  </div>`
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#20201e;color:#ffffff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:7px">${label}</a>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export type QuoteEmail = { to: string; clientName: string; quoteLink: string }

export async function sendQuoteEmail(email: QuoteEmail): Promise<void> {
  const html = shell(
    'Your quote is ready',
    `<p>Hi ${escapeHtml(email.clientName)}, your photography quote is ready to review.</p><p>${button(email.quoteLink, 'View your quote')}</p>`,
  )
  await deliver({ to: email.to, subject: 'Your Moments quote', html, event: 'email.quote_sent', devLink: email.quoteLink })
}

export type ComposedQuoteEmail = { to: string; subject: string; body: string; quoteLink: string }

/**
 * Send the quote email with a staff-composed subject + body (the message written in the Send-quote
 * dialog). The plain-text body becomes paragraphs, then the "View your quote" button/link is appended
 * inside the Moments email shell. Graceful: when no provider is configured it only records intent.
 */
export async function sendComposedQuoteEmail(email: ComposedQuoteEmail): Promise<void> {
  const paragraphs = email.body
    .trim()
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
  const subject = email.subject.trim() || 'Your Moments quote'
  const html = shell(subject, `${paragraphs}<p>${button(email.quoteLink, 'View your quote')}</p>`)
  await deliver({ to: email.to, subject, html, event: 'email.quote_sent', devLink: email.quoteLink })
}

export type ContractEmail = { to: string; clientName: string; contractLink: string }

/** Sends the client the private link to review and sign their booking contract. */
export async function sendContractEmail(email: ContractEmail): Promise<void> {
  const html = shell(
    'Your booking contract',
    `<p>Hi ${email.clientName}, please review and sign your booking contract.</p><p>${button(email.contractLink, 'Review and sign')}</p>`,
  )
  await deliver({ to: email.to, subject: 'Your Moments booking contract', html, event: 'email.contract_sent', devLink: email.contractLink })
}

export type TaskDigestEmail = { to: string; name: string; overdue: string[]; today: string[] }

/** A daily digest to a staff member: the tasks that are overdue or due today across the studio. */
export async function sendTaskDigestEmail(email: TaskDigestEmail): Promise<void> {
  const list = (items: string[]) =>
    `<ul style="margin:6px 0 16px;padding-left:18px">${items
      .map((i) => `<li style="margin:3px 0">${i}</li>`)
      .join('')}</ul>`
  const section = (title: string, items: string[]) =>
    items.length ? `<h2 style="font-size:15px;font-weight:700;margin:16px 0 4px">${title}</h2>${list(items)}` : ''
  const html = shell(
    'What needs you today',
    `<p>Hi ${email.name},</p>${section('Overdue', email.overdue)}${section('Due today', email.today)}`,
  )
  await deliver({ to: email.to, subject: 'Moments - tasks due today', html, event: 'email.task_digest' })
}

export type PasswordResetEmail = { to: string; resetLink: string }

/** Sends the staff member their single-use password reset link. */
export async function sendPasswordResetEmail(email: PasswordResetEmail): Promise<void> {
  const html = shell(
    'Reset your password',
    `<p>We received a request to reset your Moments password. This link works once and expires in 60 minutes.</p>
     <p>${button(email.resetLink, 'Set a new password')}</p>
     <p style="color:#9c948b;font-size:13px">If you did not request this, you can safely ignore this email.</p>`,
  )
  await deliver({ to: email.to, subject: 'Reset your Moments password', html, event: 'email.password_reset_sent', devLink: email.resetLink })
}
