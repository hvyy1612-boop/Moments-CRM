import type { Prisma } from '@prisma/client'
import { formatAud } from '@/lib/money'
import { formatSydneyDate } from '@/lib/time'

type D = Prisma.Decimal

export type InvoiceDoc = {
  invoiceNumber: string
  type: string
  invoiceDate: Date | null
  poNumber: string | null
  notes: string | null
  subtotal: D
  taxTotal: D
  total: D
  amountPaid: D
  billingNameSnapshot: string
  billingEmailSnapshot: string | null
  lines: { description: string; quantity: number; unitPrice: D; lineTotal: D }[]
  instalments: { label: string | null; dueAt: Date | null; amount: D; status: string }[]
  project: {
    client: { phone: string | null; street: string | null; suburb: string | null; state: string | null; postcode: string | null; country: string | null }
    company: { name: string; abn: string | null }
  }
}

/** Presentational Tax Invoice sheet, shared by the staff print page and the client portal. */
export function InvoiceDocument({ invoice }: { invoice: InvoiceDoc }) {
  const c = invoice.project.client
  const addr = [c.street, [c.suburb, c.state, c.postcode].filter(Boolean).join(' '), c.country].filter(Boolean)
  const due = invoice.total.sub(invoice.amountPaid)

  return (
    <div className="mx-auto max-w-3xl rounded-md border border-line bg-surface p-8 shadow-sm print:border-0 print:shadow-none">
      <div className="flex items-start justify-between border-b border-line pb-5">
        <div>
          <div className="font-serif text-2xl font-semibold uppercase tracking-[0.18em] text-ink">{invoice.project.company.name}</div>
          {invoice.project.company.abn ? <div className="mt-1 text-sm text-ink-muted">ABN {invoice.project.company.abn}</div> : null}
        </div>
        <div className="text-right">
          <div className="font-serif text-xl font-semibold text-ink">Tax Invoice</div>
          <div className="mt-1 text-sm text-ink-muted">{invoice.invoiceNumber}</div>
          <div className="text-sm text-ink-muted">{formatSydneyDate(invoice.invoiceDate ?? new Date())}</div>
          {invoice.poNumber ? <div className="text-sm text-ink-muted">PO: {invoice.poNumber}</div> : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 py-5">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-muted">Bill to</div>
          <div className="mt-1 text-ink">{invoice.billingNameSnapshot}</div>
          {invoice.billingEmailSnapshot ? <div className="text-sm text-ink-muted">{invoice.billingEmailSnapshot}</div> : null}
          {c.phone ? <div className="text-sm text-ink-muted">{c.phone}</div> : null}
          {addr.map((l) => <div key={l} className="text-sm text-ink-muted">{l}</div>)}
        </div>
        <div className="text-right">
          <div className="text-xs font-bold uppercase tracking-wide text-muted">Invoice type</div>
          <div className="mt-1 text-sm capitalize text-ink-muted">{invoice.type.toLowerCase()}</div>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line-strong text-left text-xs uppercase tracking-wide text-muted">
            <th className="py-2">Description</th>
            <th className="py-2 text-right">Qty</th>
            <th className="py-2 text-right">Unit</th>
            <th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((l, i) => (
            <tr key={i} className="border-b border-line align-top">
              <td className="py-2 pr-2 text-ink">{l.description}</td>
              <td className="tabular py-2 text-right text-ink-muted">{l.quantity}</td>
              <td className="tabular py-2 text-right text-ink-muted">{formatAud(l.unitPrice)}</td>
              <td className="tabular py-2 text-right text-ink">{formatAud(l.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto mt-4 w-full max-w-xs text-sm">
        <div className="flex justify-between py-0.5 text-ink-muted"><span>Subtotal (excl. GST)</span><span className="tabular">{formatAud(invoice.subtotal)}</span></div>
        <div className="flex justify-between py-0.5 text-ink-muted"><span>GST</span><span className="tabular">{formatAud(invoice.taxTotal)}</span></div>
        <div className="mt-1 flex justify-between border-t border-line pt-1 font-semibold text-ink"><span>Total (incl. GST)</span><span className="tabular">{formatAud(invoice.total)}</span></div>
        {invoice.amountPaid.greaterThan(0) ? (
          <>
            <div className="flex justify-between py-0.5 text-ink-muted"><span>Paid</span><span className="tabular">{formatAud(invoice.amountPaid)}</span></div>
            <div className="flex justify-between py-0.5 font-semibold text-ink"><span>Amount due</span><span className="tabular">{formatAud(due)}</span></div>
          </>
        ) : null}
      </div>

      {invoice.instalments.length > 1 ? (
        <div className="mt-6 border-t border-line pt-4">
          <div className="text-xs font-bold uppercase tracking-wide text-muted">Payment schedule</div>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {invoice.instalments.map((it, i) => (
                <tr key={i} className="border-b border-line last:border-b-0">
                  <td className="py-1.5 text-ink">{it.label ?? `Instalment ${i + 1}`}</td>
                  <td className="py-1.5 text-ink-muted">{it.dueAt ? `due ${formatSydneyDate(it.dueAt)}` : ''}</td>
                  <td className="py-1.5 text-right capitalize text-ink-muted">{it.status.toLowerCase()}</td>
                  <td className="tabular py-1.5 text-right text-ink">{formatAud(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {invoice.notes ? (
        <div className="mt-6 border-t border-line pt-4">
          <div className="text-xs font-bold uppercase tracking-wide text-muted">Notes</div>
          <p className="mt-1 whitespace-pre-line text-sm text-ink-muted">{invoice.notes}</p>
        </div>
      ) : null}
    </div>
  )
}
