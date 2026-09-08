import { prisma } from '@/lib/db'
import {
  getInvoiceBalance,
  getJobBalance,
  type InvoiceBalance,
  type InvoiceMoneyInput,
  type JobBalance,
} from './money'

/**
 * Prisma shell for the Money foundation (docs/25 Part 1). Fetches the ledger facts and delegates ALL
 * arithmetic to the pure functions in `money.ts`, so every screen shares one derivation. Fetches are
 * batched (a job's invoices in a single query) to avoid N+1 on list pages.
 *
 * Credit notes are fetched here (effective only — VOIDED excluded) and folded into the obligation by
 * `money.ts`. This read path is separate from the always-on writers, so a DB without the credit_notes
 * migration still records payments; only these derivations need the table.
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
  payments: { select: { transactions: { select: { type: true, status: true, amount: true } } } },
  creditNotes: { where: { NOT: { status: 'VOIDED' } }, select: { amount: true } },
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
    creditNotes: inv.creditNotes.map((c) => ({ amount: c.amount })), // effective only (VOIDED filtered out)
  }
}

/** One invoice's balance, derived from its ledger. */
export async function getInvoiceBalanceById(invoiceId: string): Promise<InvoiceBalance | null> {
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: INVOICE_MONEY_SELECT })
  return inv ? getInvoiceBalance(toInvoiceMoneyInput(inv)) : null
}

/**
 * Whole-job balance. One query for all the project's invoices, plus the KNOWN agreed value — the
 * accepted quote version total, else the direct booking's package price snapshot, else null (unknown).
 * Never derived from what has been invoiced (docs/25 Rule M4b).
 */
export async function getJobBalanceByProjectId(projectId: string): Promise<JobBalance> {
  const [invoices, project, acceptedQuote] = await Promise.all([
    prisma.invoice.findMany({ where: { projectId }, select: INVOICE_MONEY_SELECT }),
    prisma.project.findUnique({ where: { id: projectId }, select: { packagePriceSnapshot: true } }),
    prisma.quoteVersion.findFirst({ where: { quote: { projectId }, status: 'ACCEPTED' }, select: { total: true } }),
  ])
  const agreed = acceptedQuote?.total ?? project?.packagePriceSnapshot ?? null
  return getJobBalance(invoices.map(toInvoiceMoneyInput), agreed)
}
