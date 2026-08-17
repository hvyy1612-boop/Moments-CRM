import { logger } from '@/lib/logger'

export type QuoteEmail = { to: string; clientName: string; quoteLink: string }

export async function sendQuoteEmail(email: QuoteEmail): Promise<void> {
  logger.info('email.quote_sent', { to: email.to, quoteLink: email.quoteLink })
}

export type ContractEmail = { to: string; clientName: string; contractLink: string }

export async function sendContractEmail(email: ContractEmail): Promise<void> {
  logger.info('email.contract_sent', { to: email.to, contractLink: email.contractLink })
}
