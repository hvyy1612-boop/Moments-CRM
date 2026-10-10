import { Prisma, type InvoiceStatus, type TransactionType } from '@prisma/client'

type D = Prisma.Decimal
const ZERO = new Prisma.Decimal(0)
const dMax = (a: D, b: D): D => (a.greaterThan(b) ? a : b)
const dMin = (a: D, b: D): D => (a.lessThan(b) ? a : b)

const OBLIGATION_STATES: ReadonlySet<InvoiceStatus> = new Set<InvoiceStatus>([
  'ISSUED',
  'SENT',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
])

export type LedgerTxn = { type: TransactionType; amount: D }

export type CreditNote = { amount: D }
export type InstalmentInput = { label: string | null; dueAt: Date | null; amount: D; sortOrder: number }

export type InvoiceMoneyInput = {
  status: InvoiceStatus
  total: D
  dueAt: Date | null
  instalments: InstalmentInput[]
  transactions: LedgerTxn[]
  creditNotes: CreditNote[]
}

export type InstalmentBalance = {
  label: string | null
  dueAt: Date | null
  amount: D
  allocatedPaid: D
  remaining: D
  state: 'PAID' | 'PARTIAL' | 'UNPAID'
}

export type InvoiceBalance = {
  issuedTotal: D
  creditedTotal: D
  obligation: D
  paidNet: D
  owed: D
  overpaymentToResolve: D
  instalments: InstalmentBalance[]
}

export type JobBalance = {

  agreedContractValue: D | null
  agreedValueKnown: boolean
  invoicedObligation: D

  uninvoicedRemainder: D | null
  paidNet: D
  outstanding: D
  overpaymentToResolve: D
  netPosition: D

  isFullySettled: boolean
  invoices: InvoiceBalance[]
}

export function computePaidNet(transactions: LedgerTxn[]): D {
  return transactions.reduce((sum, t) => (t.type === 'CHARGE' ? sum.add(t.amount) : sum.sub(t.amount)), ZERO)
}

export function allocatePaymentsToInstalments(paidNet: D, instalments: InstalmentInput[]): InstalmentBalance[] {
  const ordered = [...instalments].sort((a, b) =>
    a.sortOrder !== b.sortOrder
      ? a.sortOrder - b.sortOrder
      : (a.dueAt?.getTime() ?? Number.POSITIVE_INFINITY) - (b.dueAt?.getTime() ?? Number.POSITIVE_INFINITY),
  )
  let pool = dMax(paidNet, ZERO)
  return ordered.map((it) => {
    const allocatedPaid = dMax(dMin(pool, it.amount), ZERO)
    pool = pool.sub(allocatedPaid)
    const remaining = it.amount.sub(allocatedPaid)
    const state: InstalmentBalance['state'] = remaining.lessThanOrEqualTo(ZERO)
      ? 'PAID'
      : allocatedPaid.greaterThan(ZERO)
        ? 'PARTIAL'
        : 'UNPAID'
    return { label: it.label, dueAt: it.dueAt, amount: it.amount, allocatedPaid, remaining, state }
  })
}

export function getInvoiceBalance(inv: InvoiceMoneyInput): InvoiceBalance {
  const issuedTotal = OBLIGATION_STATES.has(inv.status) ? inv.total : ZERO

  const creditedTotal = OBLIGATION_STATES.has(inv.status)
    ? inv.creditNotes.reduce((s, c) => s.add(c.amount), ZERO)
    : ZERO
  const obligation = dMax(issuedTotal.sub(creditedTotal), ZERO)
  const paidNet = computePaidNet(inv.transactions)
  const owed = dMax(obligation.sub(paidNet), ZERO)
  const overpaymentToResolve = dMax(paidNet.sub(obligation), ZERO)
  const schedule = inv.instalments.length > 0
    ? inv.instalments
    : [{ label: 'Full payment', dueAt: inv.dueAt, amount: obligation, sortOrder: 0 }]
  return {
    issuedTotal,
    creditedTotal,
    obligation,
    paidNet,
    owed,
    overpaymentToResolve,
    instalments: allocatePaymentsToInstalments(paidNet, schedule),
  }
}

export function nextPaymentDue(bal: InvoiceBalance): Date | null {
  if (bal.owed.lessThanOrEqualTo(ZERO)) return null
  return bal.instalments.find((i) => i.state !== 'PAID')?.dueAt ?? null
}

export function getJobBalance(invoices: InvoiceMoneyInput[], agreedContractValue: D | null): JobBalance {
  const per = invoices.map(getInvoiceBalance)
  const invoicedObligation = per.reduce((s, b) => s.add(b.obligation), ZERO)
  const paidNet = per.reduce((s, b) => s.add(b.paidNet), ZERO)
  const outstanding = per.reduce((s, b) => s.add(b.owed), ZERO)
  const overpaymentToResolve = per.reduce((s, b) => s.add(b.overpaymentToResolve), ZERO)
  const agreedValueKnown = agreedContractValue !== null

  const invoicedGross = per.reduce((s, b) => s.add(b.issuedTotal), ZERO)
  const uninvoicedRemainder = agreedContractValue !== null ? dMax(agreedContractValue.sub(invoicedGross), ZERO) : null
  const netPosition = invoicedObligation.sub(paidNet)
  const isFullySettled =
    agreedValueKnown &&
    outstanding.lessThanOrEqualTo(ZERO) &&
    overpaymentToResolve.lessThanOrEqualTo(ZERO) &&
    uninvoicedRemainder !== null &&
    uninvoicedRemainder.lessThanOrEqualTo(ZERO)
  return {
    agreedContractValue,
    agreedValueKnown,
    invoicedObligation,
    uninvoicedRemainder,
    paidNet,
    outstanding,
    overpaymentToResolve,
    netPosition,
    isFullySettled,
    invoices: per,
  }
}
