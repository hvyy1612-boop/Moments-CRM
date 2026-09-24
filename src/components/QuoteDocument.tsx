import { Prisma } from '@prisma/client'
import { computeDeposit } from '@/lib/domain/pricing'
import { formatAud } from '@/lib/money'
import { formatSydneyDate } from '@/lib/time'

/**
 * The quotation document — the polished, client-facing view of a quote (brand, header, line items with
 * inclusions, GST-inclusive totals, payment schedule, notes). Shared by the staff "Preview quote" route
 * and the client token page so both show exactly the same thing. Read-only; no actions, no internal IDs.
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

export function QuoteDocument({ doc }: { doc: QuoteDocData }) {
  const dep = doc.depositPercent != null ? computeDeposit(doc.total, doc.depositPercent) : null
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-accent">Moments Photography and Film</p>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl text-ink">Quote {doc.number}</h1>
          <span className="text-sm text-ink-muted">
            {doc.issueDate ? `Issued ${formatSydneyDate(doc.issueDate)}` : ''}
            {doc.issueDate && doc.validUntil ? ' · ' : ''}
            {doc.validUntil ? `Valid until ${formatSydneyDate(doc.validUntil)}` : ''}
          </span>
        </div>
        <p className="mt-1 text-ink-muted">Prepared for {doc.clientName}.</p>
      </div>

      {doc.introduction ? <p className="whitespace-pre-line text-ink">{doc.introduction}</p> : null}

      <section className="rounded border border-line bg-surface p-5">
        <ul className="flex flex-col">
          {doc.lines.map((line) => (
            <li key={line.id} className="border-b border-line py-3 last:border-b-0">
              <div className="flex justify-between gap-3">
                <span className="font-medium text-ink">{line.description}</span>
                <span className="tabular-nums text-ink">{formatAud(line.lineTotal)}</span>
              </div>
              <div className="mt-0.5 text-xs text-ink-muted">{line.quantity} × {formatAud(line.unitPrice)}</div>
              {line.details ? <p className="mt-1 whitespace-pre-line text-sm text-ink-muted">{line.details}</p> : null}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-col gap-1 border-t border-line pt-3 text-sm">
          <div className="flex justify-between text-ink-muted"><span>Subtotal (excl. GST)</span><span className="tabular-nums">{formatAud(doc.subtotal)}</span></div>
          <div className="flex justify-between text-ink-muted"><span>GST</span><span className="tabular-nums">{formatAud(doc.taxTotal)}</span></div>
          <div className="mt-1 flex justify-between border-t border-line pt-2 text-base font-medium text-ink"><span>Total (incl. GST)</span><span className="tabular-nums">{formatAud(doc.total)}</span></div>
        </div>
      </section>

      {dep ? (
        <section className="rounded border border-line bg-surface p-5">
          <h2 className="mb-3 text-sm font-bold text-ink">Payment schedule</h2>
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between gap-3 border-b border-line pb-2">
              <div><div className="text-ink">Booking deposit</div><div className="text-xs text-ink-muted">{doc.depositPercent}% · due on acceptance</div></div>
              <span className="tabular-nums font-medium text-ink">{formatAud(dep.deposit)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div><div className="text-ink">Remaining balance</div><div className="text-xs text-ink-muted">{100 - (doc.depositPercent ?? 0)}% · due before the shoot</div></div>
              <span className="tabular-nums font-medium text-ink">{formatAud(dep.balance)}</span>
            </div>
          </div>
        </section>
      ) : null}

      {doc.notes ? (
        <section className="rounded border border-line bg-surface p-5">
          <h2 className="mb-2 text-sm font-bold text-ink">Notes</h2>
          <p className="whitespace-pre-line text-sm text-ink-muted">{doc.notes}</p>
        </section>
      ) : null}
    </div>
  )
}
