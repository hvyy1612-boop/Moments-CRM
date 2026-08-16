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
