import { prisma } from '@/lib/db'
import {
  getInvoiceBalance,
  type InvoiceBalance,
  type InvoiceMoneyInput,
} from './money'

/**
 * Prisma shell for the Money foundation (docs/25 Part 1). Fetches the ledger facts and delegates ALL
 * arithmetic to the pure functions in `money.ts`, so every screen shares one derivation. Fetches are
 * batched (a job's invoices in a single query) to avoid N+1 on list pages.
 *
 * Credit notes are fetched here and folded into the obligation by `money.ts`.
 */

/**
 * The columns every money derivation needs. Exported so in-transaction gates (close-job,
 * auto-complete) can fetch the same shape via their own `tx` and reuse `toInvoiceMoneyInput` +
 * the pure `money.ts` functions — one derivation, whether inside a transaction or not.
 */
export const INVOICE_MONEY_SELECT = {
  status: true,
  total: true,
  dueAt: true,
  instalments: { select: { label: true, dueAt: true, amount: true, sortOrder: true } },
  payments: { select: { transactions: { select: { type: true, amount: true } } } },
  creditNotes: { select: { amount: true } },
} as const

export type InvoiceMoneyRow = {
  status: InvoiceMoneyInput['status']
  total: InvoiceMoneyInput['total']
  dueAt: Date | null
  instalments: InvoiceMoneyInput['instalments']
  payments: { transactions: InvoiceMoneyInput['transactions'] }[]
  creditNotes: { amount: InvoiceMoneyInput['total'] }[]
}

export function toInvoiceMoneyInput(inv: InvoiceMoneyRow): InvoiceMoneyInput {
  return {
    status: inv.status,
    total: inv.total,
    dueAt: inv.dueAt,
    instalments: inv.instalments,
    transactions: inv.payments.flatMap((p) => p.transactions),
    creditNotes: inv.creditNotes.map((c) => ({ amount: c.amount })),
  }
}

/** One invoice's balance, derived from its ledger. */
export async function getInvoiceBalanceById(invoiceId: string): Promise<InvoiceBalance | null> {
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: INVOICE_MONEY_SELECT })
  return inv ? getInvoiceBalance(toInvoiceMoneyInput(inv)) : null
}
