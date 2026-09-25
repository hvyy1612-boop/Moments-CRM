import { Prisma } from '@prisma/client'
import { computeDeposit } from '@/lib/domain/pricing'
import { formatAud } from '@/lib/money'
import { formatSydneyDate } from '@/lib/time'

/**
 * The quotation document — the polished, client-facing view of a quote. A clear, ruled A4 business
 * document (not a web layout), modelled on the classic "QUOTE" template the studio asked for: a big
 * QUOTE title, a labelled business block, a boxed customer meta grid, a Summary box, a gridded line-item
 * table with zebra rows, a boxed TOTAL, a payment schedule and Terms boxes. Shared by the staff
 * "Preview quote" route and the client token page, and printable to PDF (browser print). Read-only.
 *
 * Print geometry mirrors the tax invoice: `@page margin:0` (the document supplies its own 10mm inset via
 * print:p-[10mm]) so Chrome never prints its own URL/date header in a page margin, and print-color-adjust
 * keeps the ruled fills/zebra when saved to PDF. mm/%/em/fr only, so the design-token check stays green.
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
const PAGE_CSS =
  '.quote-doc,.quote-doc *{-webkit-print-color-adjust:exact;print-color-adjust:exact}@media print{@page{size:A4;margin:0}.quote-doc{box-shadow:none!important}}'

export function QuoteDocument({ doc }: { doc: QuoteDocData }) {
  const dep = doc.depositPercent != null ? computeDeposit(doc.total, doc.depositPercent) : null

  const customerRows: { label: string; value: string }[] = [
    { label: 'Customer name', value: doc.clientName },
    { label: 'Quote number', value: doc.number },
    { label: 'Date', value: doc.issueDate ? formatSydneyDate(doc.issueDate) : '-' },
    { label: 'Quote valid until', value: doc.validUntil ? formatSydneyDate(doc.validUntil) : '-' },
  ]
  const businessRows: { label: string; value: string }[] = [
    { label: 'Web', value: WEBSITE },
    { label: 'Location', value: SERVICE_AREA },
  ]

  return (
    <div className="quote-doc mx-auto w-full max-w-[210mm] rounded-md border border-line bg-surface p-[12mm] text-ink shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-[10mm] print:shadow-none">
      {/* Header: QUOTE title | business block */}
      <div className="flex flex-wrap items-start justify-between gap-8">
        <h1 className="text-5xl font-light uppercase leading-none tracking-tight text-ink">Quote</h1>
        <div className="min-w-[74mm]">
          <div className="text-sm font-bold uppercase tracking-[0.12em] text-ink">{BRAND}</div>
          <div className="mt-2 overflow-hidden rounded-sm border border-line-strong">
            {businessRows.map((r, i) => (
              <div key={r.label} className={`grid grid-cols-[24mm_1fr] text-xs${i > 0 ? ' border-t border-line' : ''}`}>
                <div className="border-r border-line bg-sunk px-2 py-1.5 font-medium text-ink-muted">{r.label}</div>
                <div className="break-words px-2 py-1.5 text-ink">{r.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Customer meta grid */}
      <div className="mt-6 max-w-[100mm] overflow-hidden rounded-sm border border-line-strong">
        {customerRows.map((r, i) => (
          <div key={r.label} className={`grid grid-cols-[38mm_1fr] text-sm${i > 0 ? ' border-t border-line' : ''}`}>
            <div className="border-r border-line bg-sunk px-3 py-2 font-medium text-ink-muted">{r.label}</div>
            <div className="break-words px-3 py-2 font-medium text-ink">{r.value}</div>
          </div>
        ))}
      </div>

      {/* Summary of requirements */}
      {doc.introduction ? (
        <section className="mt-6">
          <div className="text-xs font-bold uppercase tracking-wider text-ink">Summary</div>
          <div className="mt-2 whitespace-pre-line rounded-sm border border-line-strong bg-paper p-3 text-sm text-ink">{doc.introduction}</div>
        </section>
      ) : null}

      {/* Line items */}
      <table className="mt-6 w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col style={{ width: '52%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '20%' }} />
        </colgroup>
        <thead>
          <tr className="bg-sunk text-xs font-bold uppercase tracking-wider text-ink">
            <th className="border border-line-strong px-3 py-2 text-left">Description</th>
            <th className="border border-line-strong px-3 py-2 text-right">Unit price</th>
            <th className="border border-line-strong px-3 py-2 text-center">Qty</th>
            <th className="border border-line-strong px-3 py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((line, i) => (
            <tr key={line.id} className={i % 2 === 1 ? 'bg-paper' : 'bg-surface'}>
              <td className="border border-line px-3 py-2 align-top">
                <div className="break-words font-semibold text-ink">{line.description}</div>
                {line.details ? <p className="mt-0.5 whitespace-pre-line break-words text-xs leading-snug text-ink-muted">{line.details}</p> : null}
              </td>
              <td className="tabular border border-line px-3 py-2 text-right align-top text-ink">{formatAud(line.unitPrice)}</td>
              <td className="tabular border border-line px-3 py-2 text-center align-top text-ink">{line.quantity}</td>
              <td className="tabular border border-line px-3 py-2 text-right align-top font-semibold text-ink">{formatAud(line.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="mt-4 flex justify-end">
        <div className="w-full max-w-[92mm] overflow-hidden rounded-sm border border-line-strong text-sm">
          <div className="flex items-center justify-between gap-6 border-b border-line px-3 py-2"><span className="text-ink-muted">Subtotal (ex GST)</span><span className="tabular text-ink">{formatAud(doc.subtotal)}</span></div>
          <div className="flex items-center justify-between gap-6 border-b border-line px-3 py-2"><span className="text-ink-muted">GST 10%</span><span className="tabular text-ink">{formatAud(doc.taxTotal)}</span></div>
          <div className="flex items-center justify-between gap-6 bg-sunk px-3 py-2.5 text-base font-bold"><span className="uppercase tracking-wide text-ink">Total</span><span className="tabular text-ink">{formatAud(doc.total)}</span></div>
        </div>
      </div>

      {/* Payment schedule */}
      {dep ? (
        <section className="mt-6">
          <div className="text-xs font-bold uppercase tracking-wider text-ink">Payment schedule</div>
          <div className="mt-2 overflow-hidden rounded-sm border border-line-strong text-sm">
            <div className="flex items-center justify-between gap-6 border-b border-line px-3 py-2">
              <div><div className="text-ink">Booking deposit</div><div className="text-xs text-ink-muted">{doc.depositPercent}% - due on acceptance</div></div>
              <span className="tabular font-semibold text-ink">{formatAud(dep.deposit)}</span>
            </div>
            <div className="flex items-center justify-between gap-6 px-3 py-2">
              <div><div className="text-ink">Remaining balance</div><div className="text-xs text-ink-muted">{100 - (doc.depositPercent ?? 0)}% - due before the shoot</div></div>
              <span className="tabular font-semibold text-ink">{formatAud(dep.balance)}</span>
            </div>
          </div>
        </section>
      ) : null}

      {/* Terms & conditions */}
      {doc.notes ? (
        <section className="mt-6">
          <div className="text-xs font-bold uppercase tracking-wider text-ink">Terms &amp; conditions</div>
          <div className="mt-2 whitespace-pre-line rounded-sm border border-line-strong bg-paper p-3 text-sm text-ink-muted">{doc.notes}</div>
        </section>
      ) : null}

      {/* Footer */}
      <div className="mt-8 border-t border-line pt-3 text-center text-xs text-muted">
        {BRAND} - {WEBSITE} - This quotation is valid until the date shown above. Thank you for your business.
      </div>

      <style>{PAGE_CSS}</style>
    </div>
  )
}
