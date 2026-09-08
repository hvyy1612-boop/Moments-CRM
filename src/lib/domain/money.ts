import { Prisma, type InvoiceStatus, type TransactionType, type TransactionStatus } from '@prisma/client'

/**
 * Money foundation (docs/25 Part 1) — the single source of every "obligation / paid / owed / due /
 * overpayment" figure. Pure and DB-agnostic: it takes plain ledger facts (fetched by a thin Prisma
 * shell), so the invariant is unit-tested with fixtures and reused identically by invoice screens,
 * the job view, workflow gates, the dashboard and reminders. No screen recomputes money; no code
 * treats `invoice.amountPaid` or `instalment.status` as truth — those are caches refreshed from here.
 *
 * Reconciled with the current schema (docs/25 Rule M2b): `paidNet` is derived ONLY from the
 * PaymentTransaction ledger (SUCCEEDED CHARGE(+) − SUCCEEDED REFUND(−) − SUCCEEDED REVERSAL(−)). The
 * `Refund` model is metadata attached to a REFUND transaction and is never summed on top.
 */

type D = Prisma.Decimal
const ZERO = new Prisma.Decimal(0)
const dMax = (a: D, b: D): D => (a.greaterThan(b) ? a : b)
const dMin = (a: D, b: D): D => (a.lessThan(b) ? a : b)

/** Invoice statuses that carry an obligation to pay. DRAFT and VOID carry none (Rule M1). */
const OBLIGATION_STATES: ReadonlySet<InvoiceStatus> = new Set<InvoiceStatus>([
  'ISSUED',
  'SENT',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
])

export type LedgerTxn = { type: TransactionType; status: TransactionStatus; amount: D }
/** A credit note reduces obligation. Effective when SUCCEEDED (or when no status is given). */
export type CreditNote = { amount: D; status?: TransactionStatus }
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
  /** Known agreed value (accepted quote total, or a direct booking's package price snapshot); null =
   *  unknown. Never derived from what has been invoiced — an unknown agreed value must not let the
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

const creditNoteIsEffective = (cn: CreditNote): boolean => cn.status === undefined || cn.status === 'SUCCEEDED'

/**
 * Net cash held = SUCCEEDED CHARGE(+) − SUCCEEDED REFUND(−) − SUCCEEDED REVERSAL(−) (Rule M2b).
 * NOTE: REVERSAL is currently never produced anywhere in the app (only REFUND is, via refundPayment);
 * subtracting it is the conservative default matching the existing convention (dashboard collected-cash).
 * If a REVERSAL producer is ever added, confirm its sign/target before trusting this direction.
 */
export function computePaidNet(transactions: LedgerTxn[]): D {
  return transactions.reduce((sum, t) => {
    if (t.status !== 'SUCCEEDED') return sum
    return t.type === 'CHARGE' ? sum.add(t.amount) : sum.sub(t.amount)
  }, ZERO)
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
  const creditedTotal = inv.creditNotes.filter(creditNoteIsEffective).reduce((s, c) => s.add(c.amount), ZERO)
  const obligation = issuedTotal.sub(creditedTotal)
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
 * Whole-job money (docs/25 §1.2). `outstanding` and `overpaymentToResolve` are summed INDEPENDENTLY
 * (Rule M3): an overpaid invoice never silently offsets an underpaid one. `netPosition` is a display
 * reference only.
 *
 * `agreedContractValue` is supplied by the caller as a KNOWN value — the accepted quote total, or a
 * direct booking's `Project.packagePriceSnapshot` — or `null` when neither exists. It is NEVER derived
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
  const uninvoicedRemainder = agreedContractValue !== null ? dMax(agreedContractValue.sub(invoicedObligation), ZERO) : null
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
