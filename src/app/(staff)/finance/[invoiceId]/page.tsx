import type { Metadata } from 'next'
import { Prisma } from '@prisma/client'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { CopyLinkField } from '@/components/ui/CopyLinkField'
import { InvoiceDocument } from '@/components/InvoiceDocument'
import { PrintButton } from '@/components/PrintButton'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { listActivePackages } from '@/lib/domain/package'
import { listInvoiceTemplates } from '@/lib/domain/finance'
import { formatAud } from '@/lib/money'
import { formatSydneyDate, formatSydneyTime, sydneyYmd } from '@/lib/time'
import { titleCase } from '@/lib/text'
import { AppShell } from '../../AppShell'
import { InvoiceEditor, type InitialInvoice } from '../../jobs/[id]/InvoiceEditor'
import { RecordPaymentForm } from '../../jobs/[id]/Finance'
import { RefundButton } from './RefundButton'
import { CollapsiblePreview } from './CollapsiblePreview'
import { InvoiceMoreMenu } from './InvoiceMoreMenu'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Invoice - Moments' }

const PRINT_CSS =
  '@media print{body *{visibility:hidden}#invoice-print,#invoice-print *{visibility:visible}#invoice-print{position:absolute;left:0;top:0;width:100%;max-height:none;overflow:visible}}'

function ymd(date: Date): string {
  const { year, month, day } = sydneyYmd(date)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export default async function InvoiceWorkspacePage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const user = await requireRole('/finance/[invoiceId]')
  const { invoiceId } = await params
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true, invoiceNumber: true, type: true, status: true, subtotal: true, taxTotal: true, total: true,
      amountPaid: true, invoiceDate: true, poNumber: true, notes: true, accessToken: true,
      billingNameSnapshot: true, billingEmailSnapshot: true,
      lines: { orderBy: { sortOrder: 'asc' }, select: { itemName: true, description: true, quantity: true, unitPrice: true, discount: true, lineTotal: true } },
      instalments: { orderBy: { sortOrder: 'asc' }, select: { label: true, dueAt: true, amount: true, status: true } },
      payments: {
        orderBy: { receivedAt: 'desc' },
        select: {
          id: true, amount: true, paymentMethod: true, receivedAt: true, status: true,
          transactions: { where: { type: 'CHARGE' }, take: 1, select: { metadata: true } },
          refunds: { where: { status: { not: 'FAILED' } }, select: { amount: true } },
        },
      },
      project: {
        select: {
          id: true, name: true,
          client: { select: { displayName: true, email: true, phone: true, street: true, suburb: true, state: true, postcode: true, country: true } },
          company: { select: { name: true, abn: true } },
          bookings: { orderBy: { startsAt: 'asc' }, take: 1, select: { startsAt: true, endsAt: true, location: true, title: true } },
        },
      },
    },
  })
  if (!inv) notFound()

  const balance = inv.total.sub(inv.amountPaid)
  const isDraft = inv.status === 'DRAFT'
  const canPay = inv.status !== 'DRAFT' && inv.status !== 'PAID' && inv.status !== 'VOID'
  const unpaid = inv.amountPaid.lte(0)
  const isEditable = unpaid && inv.status !== 'VOID' && inv.status !== 'PAID' && inv.status !== 'PARTIALLY_PAID'
  const canVoid = unpaid && inv.status !== 'VOID' && inv.status !== 'DRAFT'

  const c = inv.project.client
  const booking = inv.project.bookings[0]
  const shootLabel = booking
    ? `${formatSydneyDate(booking.startsAt)} · ${formatSydneyTime(booking.startsAt)}-${formatSydneyTime(booking.endsAt)}`
    : null
  const clientAddress = [c.street, [c.suburb, c.state, c.postcode].filter(Boolean).join(' '), c.country].filter(Boolean).join('\n') || null

  // Payment history rows
  const paymentRows = inv.payments.map((p) => {
    const refunded = p.refunds.reduce((s, r) => s.add(r.amount), new Prisma.Decimal(0))
    const refundable = p.amount.sub(refunded)
    const meta = p.transactions[0]?.metadata as Record<string, unknown> | null | undefined
    const reference = meta && typeof meta.reference === 'string' ? meta.reference : null
    return {
      id: p.id,
      dateLabel: p.receivedAt ? formatSydneyDate(p.receivedAt) : '-',
      amountLabel: formatAud(p.amount),
      refundedLabel: refunded.greaterThan(0) ? formatAud(refunded) : null,
      method: titleCase(p.paymentMethod.toLowerCase().replace(/_/g, ' ')),
      reference,
      statusLabel: p.status.toLowerCase().replace(/_/g, ' '),
      refundable: refundable.toString(),
      canRefund: refundable.greaterThan(0) && inv.status !== 'VOID',
    }
  })

  // Editor initial (separate the whole-invoice discount out of its negative line)
  const discountLine = inv.lines.find((l) => l.itemName === 'Discount' && l.unitPrice.lessThan(0))
  const realLines = inv.lines.filter((l) => l !== discountLine)
  const initial: InitialInvoice = {
    type: inv.type,
    invoiceNumber: inv.invoiceNumber,
    invoiceDate: inv.invoiceDate ? ymd(inv.invoiceDate) : '',
    poNumber: inv.poNumber ?? '',
    notes: inv.notes ?? '',
    discount: discountLine ? discountLine.unitPrice.abs().toString() : '',
    lines: realLines.map((l) => ({
      name: l.itemName ?? '',
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice.toString(),
      discount: l.discount.greaterThan(0) ? l.discount.toString() : '',
    })),
    instalments: inv.instalments.length > 1
      ? inv.instalments.map((it) => ({ label: it.label ?? '', dueAt: it.dueAt ? ymd(it.dueAt) : '', amount: it.amount.toString() }))
      : [],
  }
  const jobContext = { name: inv.project.name, type: booking?.title ?? null, shootLabel, location: booking?.location ?? null }
  const clientContext = { name: c.displayName, email: inv.billingEmailSnapshot ?? c.email, phone: c.phone, address: clientAddress }

  const packages = isEditable
    ? (await listActivePackages()).map((p) => ({ id: p.id, name: p.name, price: p.basePriceInclGst.toString(), description: p.description, inclusions: p.inclusions, isAddOn: p.isAddOn }))
    : []
  const templates = isEditable ? await listInvoiceTemplates() : []

  return (
    <AppShell user={user} csrf={csrf} active="finance">
      <div>
        {/* Header */}
        <Link href="/finance" className="text-sm font-bold text-accent hover:underline">&lt;- Payments</Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl font-semibold text-ink">Invoice #{inv.invoiceNumber}</h1>
            <p className="mt-1 text-sm text-ink-muted">
              Status: <span className="font-semibold capitalize text-ink">{inv.status.toLowerCase().replace(/_/g, ' ')}</span>
              {' · '}{c.displayName} · <Link href={`/jobs/${inv.project.id}`} className="text-accent hover:underline">{inv.project.name}</Link>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <PrintButton label="Download PDF" />
            {inv.accessToken ? (
              <Link href={`/invoice/${inv.accessToken}`} target="_blank"><Button size="sm">Client view</Button></Link>
            ) : null}
            <InvoiceMoreMenu csrf={csrf} invoiceId={inv.id} projectId={inv.project.id} isDraft={isDraft} canVoid={canVoid} canDelete={unpaid} />
          </div>
        </div>

        {/* Financial summary strip */}
        <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4">
          {[
            { label: 'Total', value: formatAud(inv.total), tone: 'text-ink', icon: <path d="M6 3h9l3 3v15l-3-2-3 2-3-2-3 2V3z" /> },
            { label: 'Paid', value: formatAud(inv.amountPaid), tone: 'text-delivered-ink', icon: <path d="M20 6 9 17l-5-5" /> },
            { label: 'Balance due', value: formatAud(balance), tone: balance.greaterThan(0) ? 'text-accent-ink' : 'text-ink', icon: <path d="M3 6h18M3 12h18M3 18h12" /> },
            { label: 'Issue date', value: inv.invoiceDate ? formatSydneyDate(inv.invoiceDate) : '-', tone: 'text-ink', icon: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></> },
          ].map((m) => (
            <div key={m.label} className="flex items-center gap-3 bg-surface p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-tint text-accent">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">{m.icon}</svg>
              </span>
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-wide text-muted">{m.label}</div>
                <div className={`tabular text-lg font-semibold ${m.tone}`}>{m.value}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5">
          {isEditable ? (
            <InvoiceEditor
              csrf={csrf}
              projectId={inv.project.id}
              packages={packages}
              templates={templates}
              invoiceId={inv.id}
              initial={initial}
              job={jobContext}
              client={clientContext}
              amountPaid={inv.amountPaid.toString()}
            />
          ) : (
            <p className="rounded-md border border-dashed border-line bg-surface px-4 py-3 text-sm text-ink-muted">
              This invoice has payments recorded or is closed, so its items are locked. Refund or void it to make changes. The full invoice is in the preview below.
            </p>
          )}
        </div>

        {/* Payments received */}
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-ink">Payments received</h2>
          {paymentRows.length === 0 ? (
            <p className="mt-2 rounded-md border border-dashed border-line bg-surface px-4 py-6 text-center text-sm text-ink-muted">No payments recorded yet.</p>
          ) : (
            <div className="mt-2 overflow-x-auto rounded-md border border-line bg-surface">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2">Method</th>
                    <th className="px-3 py-2">Reference</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentRows.map((p) => (
                    <tr key={p.id} className="border-b border-line align-top last:border-b-0">
                      <td className="tabular px-3 py-2 text-ink-muted">{p.dateLabel}</td>
                      <td className="tabular px-3 py-2 text-right text-ink">
                        {p.amountLabel}
                        {p.refundedLabel ? <div className="text-xs text-danger">-{p.refundedLabel} refunded</div> : null}
                      </td>
                      <td className="px-3 py-2 text-ink-muted">{p.method}</td>
                      <td className="px-3 py-2 text-ink-muted">{p.reference ?? '-'}</td>
                      <td className="px-3 py-2 capitalize text-ink-muted">{p.statusLabel}</td>
                      <td className="px-3 py-2 text-right">
                        {p.canRefund ? <RefundButton csrf={csrf} paymentId={p.id} invoiceId={inv.id} refundable={p.refundable} /> : <span className="text-ink-muted">-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {canPay ? (
            <div className="mt-3 max-w-2xl rounded-md border border-line bg-surface p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold uppercase tracking-wide text-muted">Record a payment</div>
                <div className="text-sm text-ink-muted">Balance <span className="tabular font-semibold text-ink">{formatAud(balance)}</span></div>
              </div>
              <RecordPaymentForm csrf={csrf} projectId={inv.project.id} invoiceId={inv.id} />
            </div>
          ) : isDraft ? (
            <p className="mt-3 text-sm text-ink-muted">Issue the invoice (••• menu) before recording a payment.</p>
          ) : null}
        </section>

        {/* Client invoice link */}
        {inv.accessToken ? (
          <section className="mt-8 max-w-2xl">
            <div className="text-xs font-bold uppercase tracking-wide text-muted">Client invoice link</div>
            <div className="mt-2 flex items-center gap-2">
              <div className="min-w-0 flex-1"><CopyLinkField path={`/invoice/${inv.accessToken}`} /></div>
              <Link href={`/invoice/${inv.accessToken}`} target="_blank"><Button variant="secondary" size="sm">Open</Button></Link>
            </div>
          </section>
        ) : null}

        {/* Invoice preview (demoted) */}
        <div className="mt-8">
          <CollapsiblePreview>
            <div id="invoice-print"><InvoiceDocument invoice={inv} /></div>
          </CollapsiblePreview>
        </div>
      </div>

      {/* Locked invoices: the sheet is the record, so keep it printable even when the preview toggle is closed. */}
      <style>{PRINT_CSS}</style>
    </AppShell>
  )
}
