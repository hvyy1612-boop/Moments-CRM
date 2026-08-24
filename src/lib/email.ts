import { logger } from '@/lib/logger'
import { maskEmail } from '@/lib/text'

const LOG_LINKS = process.env.NODE_ENV !== 'production'

export type QuoteEmail = { to: string; clientName: string; quoteLink: string }

export async function sendQuoteEmail(email: QuoteEmail): Promise<void> {
  logger.info('email.quote_sent', {
    to: maskEmail(email.to),
    ...(LOG_LINKS ? { quoteLink: email.quoteLink } : {}),
  })
}

export type ContractEmail = { to: string; clientName: string; contractLink: string }

export async function sendContractEmail(email: ContractEmail): Promise<void> {
  logger.info('email.contract_sent', {
    to: maskEmail(email.to),
    ...(LOG_LINKS ? { contractLink: email.contractLink } : {}),
  })
}

export type PasswordResetEmail = { to: string; resetLink: string }

export async function sendPasswordResetEmail(email: PasswordResetEmail): Promise<void> {
  logger.info('email.password_reset_sent', {
    to: maskEmail(email.to),
    ...(LOG_LINKS ? { resetLink: email.resetLink } : {}),
  })
}
