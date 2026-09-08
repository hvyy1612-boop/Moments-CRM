import { prisma } from '@/lib/db'
import {
  getInvoiceBalance,
  getJobBalance,
  type InvoiceBalance,
  type InvoiceMoneyInput,
  type JobBalance,
} from './money'

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

export async function getInvoiceBalanceById(invoiceId: string): Promise<InvoiceBalance | null> {
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: INVOICE_MONEY_SELECT })
  return inv ? getInvoiceBalance(toInvoiceMoneyInput(inv)) : null
}

export async function getJobBalanceByProjectId(projectId: string): Promise<JobBalance> {
  const [invoices, project, acceptedQuote] = await Promise.all([
    prisma.invoice.findMany({ where: { projectId }, select: INVOICE_MONEY_SELECT }),
    prisma.project.findUnique({ where: { id: projectId }, select: { packagePriceSnapshot: true } }),
    prisma.quoteVersion.findFirst({ where: { quote: { projectId }, status: 'ACCEPTED' }, select: { total: true } }),
  ])
  const agreed = acceptedQuote?.total ?? project?.packagePriceSnapshot ?? null
  return getJobBalance(invoices.map(toInvoiceMoneyInput), agreed)
}
