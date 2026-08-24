import { logger } from '@/lib/logger'

export type QuoteEmail = { to: string; clientName: string; quoteLink: string }

/**
 * Slice 1 email adapter. It records the outbound message; a real transactional provider (Resend /
 * Postmark / SES) is wired later behind env flags. The outbox event is the durable record of intent,
 * so nothing is lost if the provider is not configured yet.
 */
export async function sendQuoteEmail(email: QuoteEmail): Promise<void> {
  logger.info('email.quote_sent', { to: email.to, quoteLink: email.quoteLink })
}

export type ContractEmail = { to: string; clientName: string; contractLink: string }

/** Sends the client the private link to review and sign their booking contract. */
export async function sendContractEmail(email: ContractEmail): Promise<void> {
  logger.info('email.contract_sent', { to: email.to, contractLink: email.contractLink })
}

export type PasswordResetEmail = { to: string; resetLink: string }

/**
 * Sends the staff member their single-use password reset link. With no transactional provider wired
 * (the default), the link is written to the server log so an operator can retrieve it; set a real
 * provider to deliver it to the inbox. The link itself is never stored in plaintext anywhere else.
 */
export async function sendPasswordResetEmail(email: PasswordResetEmail): Promise<void> {
  logger.info('email.password_reset_sent', { to: email.to, resetLink: email.resetLink })
}
