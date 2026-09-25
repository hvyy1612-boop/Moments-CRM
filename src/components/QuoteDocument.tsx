import { Prisma } from '@prisma/client'
import { computeDeposit } from '@/lib/domain/pricing'
import { formatAud } from '@/lib/money'
import { formatSydneyDate } from '@/lib/time'

/**
 * The quotation document — the polished, client-facing view of a quote. A professional A4 document (not
 * a web layout): brand wordmark, a QUOTATION header with meta, a From / Prepared for band, line items
 * with inclusions, GST-inclusive totals, payment schedule and notes. Shared by the staff "Preview quote"
 * route and the client token page, and printable to PDF (browser print). Read-only; no internal IDs.
 *
 * Print geometry mirrors the tax invoice: `@page margin:0` (the document supplies its own 10mm inset via
 * print:p-[10mm]) so Chrome never prints its own URL/date header in a page margin. mm/%/em only, so the
 * design-token check stays green.
 */
export type QuoteDocData = {
  number: string
  clientName: string
  issueDate: Date | null
  validUntil: Date | null
  introduction: string | null
  lines: { id: string; description: string; details: string | null; quantity: number; unitPrice: Prisma.Decimal; lineTotal: Prisma.Decimal }[]
  subtotal: Prisma.Decimal
  taxTotal: Prisma.Decimal
  total: Prisma.Decimal
  depositPercent: number | null
  notes: string | null
}

const BRAND = 'Moments Photography and Film'
const WEBSITE = 'momentsphotography.com.au'
const SERVICE_AREA = 'Sydney, NSW, Australia'
const PAGE_CSS = '@media print{@page{size:A4;margin:0}.quote-doc{box-shadow:none!important}}'

export function QuoteDocument({ doc }: { doc: QuoteDocData }) {
  const dep = doc.depositPercent != null ? computeDeposit(doc.total, doc.depositPercent) : null
  const [markPrimary, ...markRest] = BRAND.split(' ')
  const markSecondary = markRest.join(' ')

  return (
    <div className="quote-doc mx-auto w-full max-w-[210mm] rounded-md border border-line bg-surface p-[12mm] text-ink shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-[10mm] print:shadow-none">
      {/* Header: wordmark | QUOTATION + meta */}
      <div className="flex flex-wrap items-start justify-between gap-6 border-b border-line-strong pb-3">
        <div>
          <div className="text-3xl font-semibold uppercase leading-none tracking-tight text-ink">{markPrimary}</div>
          {markSecondary ? <div className="mt-1 text-xs font-medium uppercase tracking-[0.34em] text-accent">{markSecondary}</div> : null}
        </div>
        <div className="min-w-[62mm] text-right">
          <div className="text-xl font-semibold uppercase tracking-[0.14em] text-ink">Quotation</div>
          <div className="mt-2 space-y-0.5 text-sm">
            <div className="flex items-baseline justify-between gap-6"><span className="text-ink-muted">Quote no.</span><span className="font-medium text-ink">{doc.number}</span></div>
            {doc.issueDate ? <div className="flex items-baseline justify-between gap-6"><span className="text-ink-muted">Issue date</span><span className="font-medium text-ink">{formatSydneyDate(doc.issueDate)}</span></div> : null}
            {doc.validUntil ? <div className="flex items-baseline justify-between gap-6"><span className="text-ink-muted">Valid until</span><span className="font-medium text-ink">{formatSydneyDate(doc.validUntil)}</span></div> : null}
          </div>
        </div>
      </div>

      {/* From / Prepared for */}
      <div className="grid grid-cols-1 gap-5 border-b border-line py-3 text-sm sm:grid-cols-2">
        <div className="min-w-0 break-words">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">From</div>
          <div className="mt-2 font-semibold text-ink">{BRAND}</div>
          <div className="mt-1 space-y-0.5 text-ink-muted">
            <div>{SERVICE_AREA}</div>
            <div>{WEBSITE}</div>
          </div>
        </div>
        <div className="min-w-0 break-words sm:text-right">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Prepared for</div>
          <div className="mt-2 font-semibold text-ink">{doc.clientName}</div>
        </div>
      </div>

      {doc.introduction ? <p className="mt-4 whitespace-pre-line text-ink">{doc.introduction}</p> : null}

      {/* Line items */}
      <table className="mt-4 w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col style={{ width: '54%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '19%' }} />
          <col style={{ width: '19%' }} />
        </colgroup>
        <thead>
          <tr className="border-y border-line-strong text-xs font-bold uppercase tracking-wider text-ink-muted">
            <th className="py-2 pr-3 text-left">Description</th>
            <th className="px-2 py-2 text-center">Qty</th>
            <th className="whitespace-nowrap px-2 py-2 text-right">Unit price</th>
            <th className="py-2 pl-3 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((line) => (
            <tr key={line.id} className="border-b border-line align-top">
              <td className="py-2 pr-3">
                <div className="break-words font-semibold text-ink">{line.description}</div>
                {line.details ? <p className="mt-0.5 whitespace-pre-line break-words text-xs leading-snug text-ink-muted">{line.details}</p> : null}
              </td>
              <td className="tabular px-2 py-2 text-center text-ink">{line.quantity}</td>
              <td className="tabular px-2 py-2 text-right text-ink">{formatAud(line.unitPrice)}</td>
              <td className="tabular py-2 pl-3 text-right font-semibold text-ink">{formatAud(line.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Summary */}
      <div className="mt-4 flex justify-end">
        <div className="w-full max-w-[80mm] text-sm">
          <div className="flex justify-between py-0.5 text-ink-muted"><span>Subtotal (ex GST)</span><span className="tabular text-ink">{formatAud(doc.subtotal)}</span></div>
          <div className="flex justify-between py-0.5 text-ink-muted"><span>GST 10%</span><span className="tabular text-ink">{formatAud(doc.taxTotal)}</span></div>
          <div className="mt-1 flex justify-between border-t border-line-strong pt-2 text-base font-semibold text-ink"><span>Total (inc GST)</span><span className="tabular">{formatAud(doc.total)}</span></div>
        </div>
      </div>

      {/* Payment schedule */}
      {dep ? (
        <div className="mt-5 border-t border-line pt-4 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Payment schedule</div>
          <div className="mt-2 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3 border-b border-line pb-2">
              <div><div className="text-ink">Booking deposit</div><div className="text-xs text-ink-muted">{doc.depositPercent}% · due on acceptance</div></div>
              <span className="tabular font-medium text-ink">{formatAud(dep.deposit)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div><div className="text-ink">Remaining balance</div><div className="text-xs text-ink-muted">{100 - (doc.depositPercent ?? 0)}% · due before the shoot</div></div>
              <span className="tabular font-medium text-ink">{formatAud(dep.balance)}</span>
            </div>
          </div>
        </div>
      ) : null}

      {/* Notes */}
      {doc.notes ? (
        <div className="mt-5 border-t border-line pt-4 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Notes</div>
          <p className="mt-2 whitespace-pre-line text-ink-muted">{doc.notes}</p>
        </div>
      ) : null}

      {/* Footer */}
      <div className="mt-6 border-t border-line pt-2 text-center text-xs text-muted">
        {BRAND} · {WEBSITE} · This quotation is valid until the date shown above. Thank you for considering us.
      </div>

      <style>{PAGE_CSS}</style>
    </div>
  )
}
