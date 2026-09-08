import { logger } from '@/lib/logger'
import { maskEmail } from '@/lib/text'

const LOG_LINKS = process.env.NODE_ENV !== 'production'
const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const emailEnabled = Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)

async function deliver(args: {
  to: string
  subject: string
  html: string
  event: string

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
    logger.info(args.event, { to: maskEmail(args.to), delivered: true })
  } catch (error) {
    logger.error(`${args.event}.error`, {
      to: maskEmail(args.to),
      message: error instanceof Error ? error.message : 'unknown',
    })
  }
}

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

export type QuoteEmail = { to: string; clientName: string; quoteLink: string }

export async function sendQuoteEmail(email: QuoteEmail): Promise<void> {
  const html = shell(
    'Your quote is ready',
    `<p>Hi ${email.clientName}, your photography quote is ready to review.</p><p>${button(email.quoteLink, 'View your quote')}</p>`,
  )
  await deliver({ to: email.to, subject: 'Your Moments quote', html, event: 'email.quote_sent', devLink: email.quoteLink })
}

export type ContractEmail = { to: string; clientName: string; contractLink: string }

export async function sendContractEmail(email: ContractEmail): Promise<void> {
  const html = shell(
    'Your booking contract',
    `<p>Hi ${email.clientName}, please review and sign your booking contract.</p><p>${button(email.contractLink, 'Review and sign')}</p>`,
  )
  await deliver({ to: email.to, subject: 'Your Moments booking contract', html, event: 'email.contract_sent', devLink: email.contractLink })
}

export type TaskDigestEmail = { to: string; name: string; overdue: string[]; today: string[] }

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

export async function sendPasswordResetEmail(email: PasswordResetEmail): Promise<void> {
  const html = shell(
    'Reset your password',
    `<p>We received a request to reset your Moments password. This link works once and expires in 60 minutes.</p>
     <p>${button(email.resetLink, 'Set a new password')}</p>
     <p style="color:#9c948b;font-size:13px">If you did not request this, you can safely ignore this email.</p>`,
  )
  await deliver({ to: email.to, subject: 'Reset your Moments password', html, event: 'email.password_reset_sent', devLink: email.resetLink })
}
