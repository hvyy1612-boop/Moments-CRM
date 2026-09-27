import { Prisma } from '@prisma/client'
import { computeDeposit } from '@/lib/domain/pricing'
import { formatAud } from '@/lib/money'
import { formatSydneyDate } from '@/lib/time'

export type QuoteDocData = {
  number: string
  clientName: string
  clientEmail?: string | null
  clientPhone?: string | null
  clientLocation?: string | null
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
const CLOSING =
  'We would be glad to answer any questions about this quotation, and we look forward to capturing your special moments.'
const PAGE_CSS =
  '.quote-doc,.quote-doc *{-webkit-print-color-adjust:exact;print-color-adjust:exact}@media print{@page{size:A4;margin:0}.quote-doc{box-shadow:none!important}}'

const BAND = 'bg-accent text-white'

export function QuoteDocument({ doc }: { doc: QuoteDocData }) {
  const dep = doc.depositPercent != null ? computeDeposit(doc.total, doc.depositPercent) : null

  const meta: { label: string; value: string }[] = [
    { label: 'Date', value: doc.issueDate ? formatSydneyDate(doc.issueDate) : '-' },
    { label: 'Quote #', value: doc.number },
    { label: 'Valid until', value: doc.validUntil ? formatSydneyDate(doc.validUntil) : '-' },
  ]

  const totals: { label: string; value: string; strong?: boolean }[] = [
    { label: 'Subtotal (ex GST)', value: formatAud(doc.subtotal) },
    { label: 'GST 10%', value: formatAud(doc.taxTotal) },
    { label: 'Total (inc GST)', value: formatAud(doc.total), strong: true },
    ...(dep
      ? [
          { label: `Deposit (${doc.depositPercent}%)`, value: formatAud(dep.deposit) },
          { label: 'Balance due', value: formatAud(dep.balance) },
        ]
      : []),
  ]

  return (
    <div className="quote-doc mx-auto w-full max-w-[210mm] rounded-md border border-line bg-surface text-ink shadow-sm print:max-w-none print:rounded-none print:border-0 print:shadow-none">
      <div className="p-[12mm] print:p-[10mm]">
        {/* Header: brand mark | Quotation title */}
        <div className="flex items-start justify-between gap-8">
          <div>
            <div className="text-2xl font-semibold uppercase leading-none tracking-tight text-ink">Moments</div>
            <div className="mt-1 text-xs font-medium uppercase tracking-wide text-accent">Photography and Film</div>
          </div>
          <h1 className="text-5xl font-light tracking-tight text-accent">Quotation</h1>
        </div>

        {/* Company block | boxed meta fields */}
        <div className="mt-6 flex items-start justify-between gap-8">
          <div className="text-sm leading-relaxed">
            <div className="font-semibold text-ink">{BRAND}</div>
            <div className="text-ink-muted">{SERVICE_AREA}</div>
            <div className="text-ink-muted">{WEBSITE}</div>
          </div>
          <div className="w-[76mm] text-sm">
            {meta.map((m, i) => (
              <div key={m.label} className={`flex items-center${i > 0 ? ' mt-1.5' : ''}`}>
                <div className="w-[28mm] font-semibold text-ink">{m.label}</div>
                <div className="flex-1 rounded-sm border border-line-strong bg-paper px-3 py-1 text-ink">{m.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Customer band */}
        <div className="mt-6 w-[104mm] max-w-full">
          <div className={`${BAND} rounded-sm px-3 py-2 text-xs font-semibold uppercase tracking-wide`}>Customer</div>
          <div className="mt-2 px-1 text-sm">
            <span className="font-semibold text-ink">Name: </span>
            <span className="break-words text-ink">{doc.clientName}</span>
          </div>
        </div>

        {/* Optional greeting */}
        {doc.introduction ? <p className="mt-4 whitespace-pre-line text-sm leading-normal text-ink">{doc.introduction}</p> : null}

        {/* Line items — accent header, even column rules, zebra rows */}
        <table className="mt-6 w-full table-fixed border-collapse border border-line-strong text-sm">
          <colgroup>
            <col style={{ width: '8%' }} />
            <col style={{ width: '46%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '17%' }} />
            <col style={{ width: '17%' }} />
          </colgroup>
          <thead>
            <tr className={`${BAND} text-xs font-semibold uppercase tracking-wide`}>
              <th className="px-3 py-2 text-center">Item</th>
              <th className="px-3 py-2 text-left">Description</th>
              <th className="px-3 py-2 text-center">Qty</th>
              <th className="px-3 py-2 text-right">Unit price</th>
              <th className="px-3 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((line, i) => (
              <tr key={line.id} className={i % 2 === 1 ? 'bg-paper' : 'bg-surface'}>
                <td className="tabular border border-line px-3 py-2 text-center align-top text-ink-muted">{i + 1}</td>
                <td className="border border-line px-3 py-2 align-top">
                  <div className="break-words font-semibold text-ink">{line.description}</div>
                  {line.details ? <p className="mt-1 whitespace-pre-line break-words text-xs leading-normal text-ink-muted">{line.details}</p> : null}
                </td>
                <td className="tabular border border-line px-3 py-2 text-center align-top text-ink">{line.quantity}</td>
                <td className="tabular border border-line px-3 py-2 text-right align-top text-ink">{formatAud(line.unitPrice)}</td>
                <td className="tabular border border-line px-3 py-2 text-right align-top font-semibold text-ink">{formatAud(line.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Notes (left) + Totals (right) — equal height, flush to the table edges */}
        <div className="mt-6 grid gap-6 sm:grid-cols-2 sm:items-stretch">
          <section className="flex flex-col">
            <div className={`${BAND} rounded-sm px-3 py-2 text-xs font-semibold uppercase tracking-wide`}>Notes or special comments</div>
            <div className="mt-2 flex-1 whitespace-pre-line rounded-sm border border-line-strong bg-paper p-3 text-sm leading-normal text-ink-muted">{doc.notes ?? ''}</div>
          </section>
          <section className="flex flex-col">
            <div className="flex flex-1 flex-col overflow-hidden rounded-sm border border-line-strong text-sm">
              {totals.map((t, i) => (
                <div key={t.label} className={`flex flex-1 items-center${i > 0 ? ' border-t border-line' : ''}${t.strong ? ' bg-sunk' : ''}`}>
                  <div className={`flex-1 px-3 py-1.5${t.strong ? ' font-semibold uppercase tracking-wide text-ink' : ' text-ink-muted'}`}>{t.label}</div>
                  <div className={`tabular w-[34mm] border-l border-line px-3 py-1.5 text-right text-ink${t.strong ? ' font-semibold' : ''}`}>{t.value}</div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Courtesy line */}
        <p className="mt-6 text-sm italic leading-normal text-ink-muted">{CLOSING}</p>

        {/* Signature */}
        <div className="mt-8 border-t border-line-strong pt-5">
          <div className="ml-auto w-[80mm] text-sm">
            <div className="flex items-end gap-3"><span className="font-semibold text-ink">Signature</span><span className="flex-1 border-b border-line-strong">&nbsp;</span></div>
            <div className="mt-5 flex items-end gap-3"><span className="font-semibold text-ink">Date</span><span className="flex-1 border-b border-line-strong">&nbsp;</span></div>
          </div>
        </div>

        {/* Closing line (no band) */}
        <div className="mt-8 text-center text-sm font-medium text-ink-muted">Thank you for your business!</div>
      </div>

      <style>{PAGE_CSS}</style>
    </div>
  )
}
