import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { formatAud } from '@/lib/money'
import { formatSydneyDate } from '@/lib/time'
import { PrintButton } from './PrintButton'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Invoice - Moments' }

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string; invoiceId: string }>
}) {
  await requireRole('/jobs/[id]/invoice/[invoiceId]')
  const { id, invoiceId } = await params

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      invoiceNumber: true, type: true, status: true, subtotal: true, taxTotal: true, total: true,
      amountPaid: true, invoiceDate: true, poNumber: true, notes: true,
      billingNameSnapshot: true, billingEmailSnapshot: true,
      lines: { orderBy: { sortOrder: 'asc' }, select: { description: true, quantity: true, unitPrice: true, lineTotal: true } },
      instalments: { orderBy: { sortOrder: 'asc' }, select: { label: true, dueAt: true, amount: true, status: true } },
      project: {
        select: {
          id: true, code: true,
          client: { select: { displayName: true, email: true, phone: true, street: true, suburb: true, state: true, postcode: true, country: true } },
          company: { select: { name: true, abn: true } },
        },
      },
    },
  })
  if (!invoice || invoice.project.id !== id) notFound()

  const c = invoice.project.client
  const addr = [c.street, [c.suburb, c.state, c.postcode].filter(Boolean).join(' '), c.country].filter(Boolean)
  const due = invoice.total.sub(invoice.amountPaid)

  return (
    <div className="min-h-screen bg-paper px-4 py-8">
      <div className="mx-auto mb-4 flex max-w-3xl items-center justify-between print:hidden">
        <Link href={`/jobs/${id}`} className="text-sm font-bold text-accent hover:underline">&lt;- Back to job</Link>
        <PrintButton />
      </div>

      <div className="mx-auto max-w-3xl rounded-md border border-line bg-surface p-8 shadow-sm print:border-0 print:shadow-none">
        {/* Header */}
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

        {/* Bill to */}
        <div className="grid grid-cols-2 gap-6 py-5">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-muted">Bill to</div>
            <div className="mt-1 text-ink">{invoice.billingNameSnapshot}</div>
            {invoice.billingEmailSnapshot ? <div className="text-sm text-ink-muted">{invoice.billingEmailSnapshot}</div> : null}
            {c.phone ? <div className="text-sm text-ink-muted">{c.phone}</div> : null}
            {addr.map((l) => <div key={l} className="text-sm text-ink-muted">{l}</div>)}
          </div>
          <div className="text-right">
            <div className="text-xs font-bold uppercase tracking-wide text-muted">Job</div>
            <div className="mt-1 text-sm text-ink-muted">{invoice.project.code}</div>
            <div className="text-sm capitalize text-ink-muted">{invoice.type.toLowerCase()} invoice</div>
          </div>
        </div>

        {/* Lines */}
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

        {/* Totals */}
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

        {/* Payment schedule */}
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

        {/* Notes */}
        {invoice.notes ? (
          <div className="mt-6 border-t border-line pt-4">
            <div className="text-xs font-bold uppercase tracking-wide text-muted">Notes</div>
            <p className="mt-1 whitespace-pre-line text-sm text-ink-muted">{invoice.notes}</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
