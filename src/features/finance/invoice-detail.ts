

export type InvoiceStatusCode = 'DRAFT' | 'ISSUED' | 'SENT' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'VOID'

export type Tone = 'neutral' | 'info' | 'good' | 'warn' | 'bad'

export function invoiceStatusView(status: string, opts?: { overdue?: boolean }): { label: string; tone: Tone } {
  if (status === 'PAID') return { label: 'Paid', tone: 'good' }
  if (status === 'VOID') return { label: 'Uncollectible', tone: 'neutral' }
  return { label: 'Unpaid', tone: opts?.overdue ? 'bad' : 'warn' }
}

export type InstalmentState = 'PAID' | 'PARTIAL' | 'UNPAID'
export type InstalmentStatus = { label: 'Paid' | 'Partially paid' | 'Overdue' | 'Unpaid' | 'Upcoming' | 'Void'; tone: Tone }

export function instalmentStatus(
  state: InstalmentState,
  dueYmd: string | null,
  todayYmd: string,
  invoiceStatus: InvoiceStatusCode,
): InstalmentStatus {
  if (invoiceStatus === 'VOID') return { label: 'Void', tone: 'neutral' }

  if (invoiceStatus === 'DRAFT') return dueYmd && dueYmd > todayYmd ? { label: 'Upcoming', tone: 'neutral' } : { label: 'Unpaid', tone: 'neutral' }
  if (state === 'PAID') return { label: 'Paid', tone: 'good' }
  if (state === 'PARTIAL') return { label: 'Partially paid', tone: 'warn' }
  if (dueYmd && dueYmd < todayYmd) return { label: 'Overdue', tone: 'bad' }
  if (dueYmd && dueYmd > todayYmd) return { label: 'Upcoming', tone: 'neutral' }
  return { label: 'Unpaid', tone: 'neutral' }
}

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

export function describeInvoiceEvent(e: {
  action: string
  afterData: unknown
  invoiceNumber: string

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
