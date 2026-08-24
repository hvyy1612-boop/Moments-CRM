import { logger } from '@/lib/logger'
import { maskEmail } from '@/lib/text'

/**
 * Slice 1 email adapter. It records the outbound message; a real transactional provider (Resend /
 * Postmark / SES) is wired later behind env flags. The outbox event is the durable record of intent,
 * so nothing is lost if the provider is not configured yet.
 *
 * PRIVACY (SEC-P02, BR-L04): logs never contain plaintext PII or tokens. The recipient email is
 * masked, and the token-bearing link is written only in development (for local testing) — never in
 * production, so a production log can never be used to hijack a reset or a client link.
 */
const LOG_LINKS = process.env.NODE_ENV !== 'production'

export type QuoteEmail = { to: string; clientName: string; quoteLink: string }

export async function sendQuoteEmail(email: QuoteEmail): Promise<void> {
  logger.info('email.quote_sent', {
    to: maskEmail(email.to),
    ...(LOG_LINKS ? { quoteLink: email.quoteLink } : {}),
  })
}

export type ContractEmail = { to: string; clientName: string; contractLink: string }

/** Sends the client the private link to review and sign their booking contract. */
export async function sendContractEmail(email: ContractEmail): Promise<void> {
  logger.info('email.contract_sent', {
    to: maskEmail(email.to),
    ...(LOG_LINKS ? { contractLink: email.contractLink } : {}),
  })
}

export type PasswordResetEmail = { to: string; resetLink: string }

/**
 * Sends the staff member their single-use password reset link. With no transactional provider wired,
 * set one to deliver the link to the inbox; the link is never written to a production log.
 */
export async function sendPasswordResetEmail(email: PasswordResetEmail): Promise<void> {
  logger.info('email.password_reset_sent', {
    to: maskEmail(email.to),
    ...(LOG_LINKS ? { resetLink: email.resetLink } : {}),
  })
}
