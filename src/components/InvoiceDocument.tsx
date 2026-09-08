import { Prisma } from '@prisma/client'
import { formatAud } from '@/lib/money'
import { formatSydneyDate, formatSydneyTime } from '@/lib/time'

type D = Prisma.Decimal

/** GST is single-rate and prices are stored GST-inclusive; ex-GST = incl / 1.1 (see splitGstInclusive). */
const GST_DIVISOR = new Prisma.Decimal('1.1')

export type InvoiceDoc = {
  invoiceNumber: string
  type: string
  status?: string
  invoiceDate: Date | null
  dueAt: Date | null
  poNumber: string | null
  notes: string | null
  total: D
  amountPaid: D
  billingNameSnapshot: string
  billingEmailSnapshot: string | null
  lines: { itemName: string | null; description: string; quantity: number; unitPrice: D; discount: D; lineTotal: D }[]
  project: {
    name: string
    code: string
    client: { phone: string | null; street: string | null; suburb: string | null; state: string | null; postcode: string | null; country: string | null }
    company: { name: string; abn: string | null; settings: Prisma.JsonValue }
    bookings: { startsAt: Date; endsAt: Date; location: string | null; title: string | null }[]
  }
}

/**
 * Print-only page geometry (A4, 10mm margins => a 190x277mm content area). The doc is a flex column that
 * fills the full page height, so a short invoice spreads down the sheet (footer pinned to the bottom via
 * print:mt-auto) instead of bunching at the top. `zoom` (set by InvoiceFit from --inv-scale) shrinks a
 * long invoice just enough to stay on one page - zoom, unlike transform, also shrinks the layout box so
 * pagination sees one page. No px/rem/hex literals so the design-token check stays green.
 */
const PAGE_CSS = '@media print{@page{size:A4;margin:10mm}.inv-doc{box-shadow:none!important;zoom:var(--inv-scale,1)}}'

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** Small stacked label + value used in the header meta and the FROM/BILL TO/JOB DETAILS band. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <span className="text-ink-muted">{label}</span>
      <span className="text-right font-medium text-ink">{children}</span>
    </div>
  )
}

/**
 * Client-facing A4 Tax Invoice, shared by the staff print page, the finance workspace preview and the
 * client portal. One document for on-screen preview and PDF (browser print). Prices are stored
 * GST-inclusive, so each line is split into an ex-GST amount + its GST, rounded per line so the
 * columns foot exactly to the summary. Private payment details are loaded from Company Settings and
 * never fabricated (SEC): when unset, the document says the studio will provide them.
 */
export function InvoiceDocument({ invoice }: { invoice: InvoiceDoc }) {
  const c = invoice.project.client
  const co = invoice.project.company
  const s = (co.settings && typeof co.settings === 'object' && !Array.isArray(co.settings) ? co.settings : {}) as Record<string, unknown>

  // Business identity. Website + service area are the studio's real public facts (momentsphotography.com.au)
  // used as safe fallbacks; everything private (ABN, email, phone, bank) comes only from Settings.
  const website = text(s.website) ?? 'momentsphotography.com.au'
  const bizAddress = text(s.businessAddress) ?? 'Sydney, NSW, Australia'
  const bizEmail = text(s.businessEmail)
  const bizPhone = text(s.businessPhone)
  const abn = text(co.abn)

  // Payment instructions — loaded from Company Settings, never invented.
  const payInstructions = text(s.paymentInstructions)
  const acctName = text(s.accountName)
  const bsb = text(s.bsb)
  const acctNo = text(s.accountNumber)
  const payId = text(s.payId)
  const hasBank = Boolean(bsb && acctNo)

  // Wordmark lockup: first word large, the remainder tracked beneath (e.g. MOMENTS / PHOTOGRAPHY & FILM).
  const [markPrimary, ...markRest] = co.name.split(' ')
  const markSecondary = markRest.join(' ')

  const addr = [c.street, [c.suburb, c.state, c.postcode].filter(Boolean).join(' '), c.country].filter(Boolean) as string[]
  const booking = invoice.project.bookings[0] ?? null

  const rows = invoice.lines.map((l) => {
    const incl = l.lineTotal
    const ex = incl.div(GST_DIVISOR).toDecimalPlaces(2)
    const gst = incl.sub(ex)
    const unitEx = l.unitPrice.div(GST_DIVISOR).toDecimalPlaces(2)
    return { ...l, incl, ex, gst, unitEx }
  })
  const subtotalEx = rows.reduce((sum, r) => sum.add(r.ex), new Prisma.Decimal(0))
  const gstTotal = rows.reduce((sum, r) => sum.add(r.gst), new Prisma.Decimal(0))
  const total = invoice.total
  const paid = invoice.amountPaid
  const balance = total.sub(paid)

  const status = invoice.status ?? ''
  const badge = status === 'PAID' ? 'Paid in full' : status === 'VOID' ? 'Void' : null

  return (
    <div className="inv-doc mx-auto flex w-full max-w-[210mm] flex-col rounded-md border border-line bg-surface p-[12mm] text-ink shadow-sm print:min-h-[277mm] print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
      {/* Header: wordmark | TAX INVOICE + meta */}
      <div className="flex flex-wrap items-start justify-between gap-6 border-b border-line-strong pb-3">
        <div>
          <div className="text-3xl font-semibold uppercase leading-none tracking-tight text-ink">{markPrimary}</div>
          {markSecondary ? <div className="mt-1 text-xs font-medium uppercase tracking-[0.34em] text-accent">{markSecondary}</div> : null}
        </div>
        <div className="min-w-[62mm] text-right">
          <div className="text-xl font-semibold uppercase tracking-[0.14em] text-ink">Tax Invoice</div>
          <div className="mt-2 space-y-0.5 text-sm">
            <Field label="Invoice no.">{invoice.invoiceNumber}</Field>
            <Field label="Issue date">{formatSydneyDate(invoice.invoiceDate ?? new Date())}</Field>
            {invoice.dueAt ? <Field label="Due date">{formatSydneyDate(invoice.dueAt)}</Field> : null}
            {invoice.poNumber ? <Field label="PO number">{invoice.poNumber}</Field> : null}
          </div>
          {badge ? (
            <div className="mt-3 inline-block rounded-sm bg-accent-tint px-2 py-1 text-xs font-semibold uppercase tracking-wide text-accent">{badge}</div>
          ) : null}
        </div>
      </div>

      {/* FROM / BILL TO / JOB DETAILS */}
      <div className="grid grid-cols-1 gap-5 border-b border-line py-3 text-sm sm:grid-cols-3">
        <div className="min-w-0 break-words">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">From</div>
          <div className="mt-2 font-semibold text-ink">{co.name}</div>
          <div className="mt-1 space-y-0.5 text-ink-muted">
            <div>{bizAddress}</div>
            {bizEmail ? <div>{bizEmail}</div> : null}
            {bizPhone ? <div>{bizPhone}</div> : null}
            <div>{website}</div>
            {abn ? <div>ABN {abn}</div> : null}
          </div>
        </div>
        <div className="min-w-0 break-words">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Bill to</div>
          <div className="mt-2 font-semibold text-ink">{invoice.billingNameSnapshot}</div>
          <div className="mt-1 space-y-0.5 text-ink-muted">
            {invoice.billingEmailSnapshot ? <div>{invoice.billingEmailSnapshot}</div> : null}
            {c.phone ? <div>{c.phone}</div> : null}
            {addr.map((line) => <div key={line}>{line}</div>)}
          </div>
        </div>
        <div className="min-w-0 break-words">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Job details</div>
          <div className="mt-2 font-semibold text-ink">{invoice.project.name}</div>
          <div className="mt-1 space-y-0.5 text-ink-muted">
            <div>Reference {invoice.project.code}</div>
            {booking ? <div>{formatSydneyDate(booking.startsAt)} · {formatSydneyTime(booking.startsAt)}-{formatSydneyTime(booking.endsAt)}</div> : null}
            {booking?.location ? <div>{booking.location}</div> : null}
          </div>
        </div>
      </div>

      {/* Line items. table-fixed enforces the colgroup widths, so the six columns keep their exact
          proportions and each header shares one alignment axis with the value under it. The three
          money columns are given equal, generous territory (15/13/15) — with right-aligned figures
          in a fixed table the separation between them comes from column width, not from padding, so
          large values like $12,500.00 never collide. Uniform vertical padding keeps every row's
          first line on one baseline. */}
      <table className="mt-4 w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col style={{ width: '18%' }} />
          <col style={{ width: '31%' }} />
          <col style={{ width: '6%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '15%' }} />
        </colgroup>
        <thead>
          <tr className="border-y border-line-strong text-xs font-bold uppercase tracking-wider text-ink-muted">
            <th className="py-2 pr-3 text-left">Item</th>
            <th className="py-2 pl-3 pr-4 text-left">Description</th>
            <th className="px-2 py-2 text-center">Qty</th>
            <th className="whitespace-nowrap px-2 py-2 text-right">Unit price</th>
            <th className="px-2 py-2 text-right">GST</th>
            <th className="py-2 pl-3 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const [descHead, ...descTail] = (r.description || '').split('\n')
            const descBody = descTail.join('\n')
            return (
              <tr key={i} className="border-b border-line align-top">
                <td className="break-words py-2 pr-3 font-semibold text-ink">{r.itemName ?? ''}</td>
                <td className="py-2 pl-3 pr-4">
                  {r.description ? (
                    <>
                      <div className="break-words text-ink">{descHead}</div>
                      {descBody ? <div className="mt-0.5 whitespace-pre-line break-words text-xs leading-snug text-ink-muted">{descBody}</div> : null}
                    </>
                  ) : (
                    <span className="text-ink-muted">{r.itemName ? '' : '-'}</span>
                  )}
                </td>
                <td className="tabular px-2 py-2 text-center text-ink">{r.quantity}</td>
                {/* Discounts are stored as negative lines; the invoice shows the figures unsigned (a
                    "Discount" row reads as a reduction on its own). Totals still use the signed values. */}
                <td className="tabular px-2 py-2 text-right text-ink">{formatAud(r.unitEx.abs())}</td>
                <td className="tabular px-2 py-2 text-right text-ink">{formatAud(r.gst.abs())}</td>
                <td className="tabular py-2 pl-3 text-right font-semibold text-ink">{formatAud(r.ex.abs())}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Summary */}
      <div className="mt-4 flex justify-end">
        <div className="w-full max-w-[80mm] text-sm">
          <div className="flex justify-between py-0.5 text-ink-muted"><span>Subtotal (ex GST)</span><span className="tabular text-ink">{formatAud(subtotalEx)}</span></div>
          <div className="flex justify-between py-0.5 text-ink-muted"><span>GST 10%</span><span className="tabular text-ink">{formatAud(gstTotal)}</span></div>
          <div className="mt-1 flex justify-between border-t border-line-strong pt-2 text-base font-semibold text-ink"><span>Total (inc GST)</span><span className="tabular">{formatAud(total)}</span></div>
          {paid.greaterThan(0) ? (
            <div className="flex justify-between py-0.5 text-ink-muted"><span>Amount paid</span><span className="tabular text-ink">-{formatAud(paid)}</span></div>
          ) : null}
          <div className="mt-1 flex justify-between border-t border-line pt-2 text-base font-semibold text-accent"><span className="text-ink">Balance due</span><span className="tabular">{formatAud(balance)}</span></div>
        </div>
      </div>

      {/* Payment instructions + notes. print:mt-auto pins this + the footer to the bottom of the page so
          a short invoice fills the sheet instead of leaving a big empty gap under the totals. */}
      <div className="mt-5 grid grid-cols-1 gap-5 border-t border-line pt-4 text-sm sm:grid-cols-2 print:mt-auto">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Payment instructions</div>
          <div className="mt-2 space-y-0.5 text-ink-muted">
            {payInstructions ? (
              <p className="whitespace-pre-line">{payInstructions}</p>
            ) : hasBank ? (
              <>
                <div>Bank transfer</div>
                {acctName ? <div><span className="text-ink">Account name:</span> {acctName}</div> : null}
                <div><span className="text-ink">BSB:</span> {bsb}</div>
                <div><span className="text-ink">Account no.:</span> {acctNo}</div>
                {payId ? <div><span className="text-ink">PayID:</span> {payId}</div> : null}
              </>
            ) : (
              <p>Bank transfer details will be provided by the studio. Please quote your invoice number as the payment reference.</p>
            )}
            <div className="pt-1"><span className="text-ink">Reference:</span> {invoice.invoiceNumber}</div>
          </div>
        </div>
        {invoice.notes ? (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Notes</div>
            <p className="mt-2 whitespace-pre-line text-ink-muted">{invoice.notes}</p>
          </div>
        ) : null}
      </div>

      {/* Footer */}
      <div className="mt-4 border-t border-line pt-2 text-center text-xs text-muted">
        {co.name}{abn ? ` · ABN ${abn}` : ''} · {website} · Thank you for choosing us.
      </div>

      <style>{PAGE_CSS}</style>
    </div>
  )
}
