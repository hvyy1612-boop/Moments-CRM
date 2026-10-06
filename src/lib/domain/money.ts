import { Prisma, type InvoiceStatus, type TransactionType } from '@prisma/client'

/**
 * Money foundation (docs/25 Part 1) — the single source of every "obligation / paid / owed / due /
 * overpayment" figure. Pure and DB-agnostic: it takes plain ledger facts (fetched by a thin Prisma
 * shell), so the invariant is unit-tested with fixtures and reused identically by invoice screens,
 * the job view, workflow gates, the dashboard and reminders. No screen recomputes money; no code
 * treats `invoice.amountPaid` or `instalment.status` as truth — those are caches refreshed from here.
 *
 * Reconciled with the current schema (docs/25 Rule M2b): `paidNet` is derived ONLY from the
 * PaymentTransaction ledger (CHARGE(+) − REFUND(−); every recorded transaction has succeeded - payments
 * are recorded by staff after the money arrived). The `Refund` model is metadata attached to a REFUND
 * transaction and is never summed on top.
 */

type D = Prisma.Decimal
const ZERO = new Prisma.Decimal(0)
const dMax = (a: D, b: D): D => (a.greaterThan(b) ? a : b)
const dMin = (a: D, b: D): D => (a.lessThan(b) ? a : b)

/** Invoice statuses that carry an obligation to pay. VOID (uncollectible) carries none (Rule M1). */
const OBLIGATION_STATES: ReadonlySet<InvoiceStatus> = new Set<InvoiceStatus>([
  'ISSUED',
  'SENT',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
])

export type LedgerTxn = { type: TransactionType; amount: D }
/** A credit note reduces obligation. */
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
  /** Known agreed value (the job's accepted quote total); null = unknown. Never derived from what has been invoiced — an unknown agreed value must not let the
   *  system conclude the job is fully invoiced / settled (docs/25 Rule M4b). */
  agreedContractValue: D | null
  agreedValueKnown: boolean
  invoicedObligation: D
  /** null when the agreed value is unknown (cannot say how much is left to invoice). */
  uninvoicedRemainder: D | null
  paidNet: D
  outstanding: D
  overpaymentToResolve: D
  netPosition: D
  /** True only when the agreed value is known AND fully invoiced AND nothing owed AND no overpayment
   *  to resolve. This is the primitive close-job / paid-in-full gates must use. */
  isFullySettled: boolean
  invoices: InvoiceBalance[]
}

/** Net cash held = CHARGE(+) − REFUND(−) (Rule M2b). */
export function computePaidNet(transactions: LedgerTxn[]): D {
  return transactions.reduce((sum, t) => (t.type === 'CHARGE' ? sum.add(t.amount) : sum.sub(t.amount)), ZERO)
}

/**
 * FIFO allocation of net cash across the payment schedule (Rule M5). Ordered by sortOrder then dueAt.
 * `state` is DERIVED here — never read `instalment.status`, which the current schema leaves stale.
 * Note (v1 limitation): a credit note reduces invoice `owed`/`obligation` but does not rebalance the
 * instalment amounts; the reminder layer gates on invoice `owed > 0` as well as instalment remaining.
 */
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

/** One invoice's money (docs/25 §1.1). */
export function getInvoiceBalance(inv: InvoiceMoneyInput): InvoiceBalance {
  const issuedTotal = OBLIGATION_STATES.has(inv.status) ? inv.total : ZERO
  // Credits only reduce a live obligation: a void/draft invoice owes nothing, so its credit notes must not
  // turn into a phantom "overpayment" (nor may credits above an edited-down total), hence the floor at 0.
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

/**
 * When the client next has to pay on an invoice: the due date of the earliest instalment that is not yet
 * fully paid, or null when nothing is owed. So an overdue deposit makes the invoice overdue even when its
 * final payment (the invoice's own due date) is months away.
 */
export function nextPaymentDue(bal: InvoiceBalance): Date | null {
  if (bal.owed.lessThanOrEqualTo(ZERO)) return null
  return bal.instalments.find((i) => i.state !== 'PAID')?.dueAt ?? null
}

/**
 * Whole-job money (docs/25 §1.2). `outstanding` and `overpaymentToResolve` are summed INDEPENDENTLY
 * (Rule M3): an overpaid invoice never silently offsets an underpaid one. `netPosition` is a display
 * reference only.
 *
 * `agreedContractValue` is supplied by the caller as a KNOWN value — the accepted quote total — or
 * `null` when there is none. It is NEVER derived
 * from what has been invoiced: an unknown agreed value leaves `uninvoicedRemainder = null` and
 * `isFullySettled = false`, so paying a deposit invoice can never masquerade as a settled job
 * (docs/25 Rule M4b).
 */
export function getJobBalance(invoices: InvoiceMoneyInput[], agreedContractValue: D | null): JobBalance {
  const per = invoices.map(getInvoiceBalance)
  const invoicedObligation = per.reduce((s, b) => s.add(b.obligation), ZERO)
  const paidNet = per.reduce((s, b) => s.add(b.paidNet), ZERO)
  const outstanding = per.reduce((s, b) => s.add(b.owed), ZERO)
  const overpaymentToResolve = per.reduce((s, b) => s.add(b.overpaymentToResolve), ZERO)
  const agreedValueKnown = agreedContractValue !== null
  // "Still to invoice" compares the agreement with what was INVOICED (gross of credits). A credit note is a
  // price reduction (e.g. an applied Price-decrease change request): it lowers the agreement by the same
  // amount it lowers the obligation, so it must not reappear here as an amount still to bill.
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
