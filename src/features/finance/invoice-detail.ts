/**
 * Invoice detail page (pure presentation logic, no UI). The money itself comes from the backend
 * derivation (`getInvoiceBalance` in lib/domain/money.ts); this only turns those facts and the audit
 * trail into the words and tones the page shows. Kept separate so it is unit-tested directly.
 */

export type InvoiceStatusCode = 'ISSUED' | 'SENT' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'VOID'

/** Tone for the shared StatusPill (ui/StatusPill): neutral unless the state carries meaning. */
export type Tone = 'neutral' | 'info' | 'good' | 'warn' | 'bad'

/**
 * The invoice status the whole UI shows is folded to just THREE plain-English states (owner decision):
 *   - Unpaid        - money is still owed (covers issued / sent / partially paid / overdue)
 *   - Paid          - settled in full
 *   - Uncollectible - written off; a debt that won't be recovered (the underlying VOID state)
 * The finer InvoiceStatus enum stays in the database for correctness; this only decides the words + tone.
 * Overdue is no longer a separate status - an unpaid invoice past its due date is still "Unpaid" but turns
 * red (tone `bad`) via the `overdue` flag, so the urgency shows without adding a fourth label.
 */
export function invoiceStatusView(status: string, opts?: { overdue?: boolean }): { label: string; tone: Tone } {
  if (status === 'PAID') return { label: 'Paid', tone: 'good' }
  if (status === 'VOID') return { label: 'Uncollectible', tone: 'neutral' }
  return { label: 'Unpaid', tone: opts?.overdue ? 'bad' : 'warn' }
}

export type InstalmentState = 'PAID' | 'PARTIAL' | 'UNPAID'
export type InstalmentStatus = { label: 'Paid' | 'Partially paid' | 'Overdue' | 'Unpaid' | 'Upcoming' | 'Void'; tone: Tone }

/**
 * One schedule row's status. The allocation state comes from the backend ledger; this only adds the
 * date reading. Nothing on a void (uncollectible) invoice is due.
 */
export function instalmentStatus(
  state: InstalmentState,
  dueYmd: string | null,
  todayYmd: string,
  invoiceStatus: InvoiceStatusCode,
): InstalmentStatus {
  if (invoiceStatus === 'VOID') return { label: 'Void', tone: 'neutral' }
  if (state === 'PAID') return { label: 'Paid', tone: 'good' }
  if (state === 'PARTIAL') return { label: 'Partially paid', tone: 'warn' }
  if (dueYmd && dueYmd < todayYmd) return { label: 'Overdue', tone: 'bad' }
  if (dueYmd && dueYmd > todayYmd) return { label: 'Upcoming', tone: 'neutral' }
  return { label: 'Unpaid', tone: 'neutral' }
}

/**
 * The latest payment that went towards each instalment, as that payment's YYYY-MM-DD date (null when
 * nothing has been paid towards it). Payments fill the schedule in order, oldest first, the same way the
 * backend allocates the paid total; each payment counts net of its refunds.
 */
export function lastPaymentPerInstalment(
  instalmentCents: number[],
  payments: { ymd: string | null; netCents: number }[],
): (string | null)[] {
  const ends: number[] = []
  let acc = 0
  for (const c of instalmentCents) ends.push((acc += c))
  const out: (string | null)[] = instalmentCents.map(() => null)
  let paid = 0
  for (const p of payments) {
    if (p.netCents <= 0) continue
    const from = paid
    const to = (paid += p.netCents)
    instalmentCents.forEach((_, i) => {
      const start = ends[i]! - instalmentCents[i]!
      if (from < ends[i]! && to > start && p.ymd) out[i] = p.ymd
    })
  }
  return out
}

const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })
const money = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? aud.format(n) : null
}
const field = (data: unknown, key: string): unknown =>
  data && typeof data === 'object' && key in data ? (data as Record<string, unknown>)[key] : undefined

const METHOD: Record<string, string> = { BANK_TRANSFER: 'bank transfer', CARD: 'card', CASH: 'cash', OTHER: 'another method' }

/**
 * One audit entry as a History log row (action + details), or null for events the log does not show.
 * Only REAL recorded events are described; nothing is inferred or invented.
 */
export function describeInvoiceEvent(e: {
  action: string
  afterData: unknown
  invoiceNumber: string
  /** For payment events: the payment's method, when the payment row still exists. */
  paymentMethod?: string | null
}): { action: string; details: string } | null {
  const amount = money(field(e.afterData, 'amount'))
  switch (e.action) {
    case 'invoice.created': {
      const total = money(field(e.afterData, 'total'))
      return { action: 'Created', details: `Invoice ${e.invoiceNumber} was created${total ? ` for ${total}` : ''}.` }
    }
    case 'invoice.updated': {
      const total = money(field(e.afterData, 'total'))
      const payments = Number(field(e.afterData, 'instalments'))
      const schedule = payments > 1 ? `, split into ${payments} payments` : payments === 1 ? ', one payment' : ''
      return { action: 'Updated', details: `Invoice details saved${total ? `. Total ${total}${schedule}` : ''}.` }
    }
    case 'invoice.issued':
      return { action: 'Issued', details: 'Invoice issued. The client link is live and payments can be recorded.' }
    case 'invoice.sent': {
      const to = field(e.afterData, 'to')
      return { action: 'Sent', details: typeof to === 'string' && to ? `Invoice sent to ${to}.` : 'Invoice sent to the client.' }
    }
    case 'invoice.voided':
      return { action: 'Voided', details: 'Invoice voided. It stays on record.' }
    case 'invoice.credit_note_issued': {
      const reason = field(e.afterData, 'reason')
      return { action: 'Credit note', details: `Credit note${amount ? ` of ${amount}` : ''} issued${typeof reason === 'string' && reason ? `: ${reason}` : ''}.` }
    }
    case 'payment.recorded': {
      const method = e.paymentMethod ? METHOD[e.paymentMethod] ?? null : null
      return { action: 'Payment recorded', details: `${amount ?? 'A'} payment recorded${method ? ` by ${method}` : ''}.` }
    }
    case 'payment.refunded':
      return { action: 'Refunded', details: `${amount ?? 'A payment'} refunded.` }
    default:
      return null
  }
}
