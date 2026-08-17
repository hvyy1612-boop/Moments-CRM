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
