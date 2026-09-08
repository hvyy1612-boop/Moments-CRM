import type { Metadata } from 'next'
import { Prisma } from '@prisma/client'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { InvoiceDocument } from '@/components/InvoiceDocument'
import { InvoiceFit } from '@/components/InvoiceFit'
import { PrintButton } from '@/components/PrintButton'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { listActivePackages } from '@/lib/domain/package'
import { getInvoiceBalanceById } from '@/lib/domain/invoice-money'
import { formatAud } from '@/lib/money'
import { formatSydneyDate, formatSydneyTime, sydneyYmd } from '@/lib/time'
import { titleCase } from '@/lib/text'
import { AppShell } from '../../AppShell'
import { InvoiceWorkspace } from './InvoiceWorkspace'
import { CollapsiblePreview } from './CollapsiblePreview'
import { InvoiceMoreMenu } from './InvoiceMoreMenu'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Invoice - Moments' }

function ymd(date: Date): string {
  const { year, month, day } = sydneyYmd(date)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// Quiet bordered action button, matching the Clients detail header (the app-wide standard).
const QUIET_BTN =
  'inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-sunk'

export default async function InvoiceWorkspacePage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const user = await requireRole('/finance/[invoiceId]')
  const { invoiceId } = await params
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const [inv, money] = await Promise.all([
    prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true, invoiceNumber: true, type: true, status: true, subtotal: true, taxTotal: true, total: true,
      amountPaid: true, invoiceDate: true, dueAt: true, poNumber: true, notes: true, accessToken: true,
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
          id: true, name: true, code: true,
          client: { select: { displayName: true, email: true, phone: true, street: true, suburb: true, state: true, postcode: true, country: true } },
          company: { select: { name: true, abn: true, settings: true } },
          bookings: { orderBy: { startsAt: 'asc' }, take: 1, select: { startsAt: true, endsAt: true, location: true, title: true } },
        },
      },
    },
    }),
    getInvoiceBalanceById(invoiceId), // ledger-derived, credit-aware (docs/25 Part 1)
  ])
  if (!inv) notFound()

  // Balance due comes from the Money foundation (subtracts credit notes, clamps overpayment to 0).
  // amountPaid is the ledger cache; money.paidNet equals it, so "Paid" can keep using amountPaid.
  const balance = money ? money.owed : inv.total.sub(inv.amountPaid)
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

  // Workspace initial (separate the whole-invoice discount out of its negative line)
  const discountLine = inv.lines.find((l) => l.itemName === 'Discount' && l.unitPrice.lessThan(0))
  const realLines = inv.lines.filter((l) => l !== discountLine)
  const wsInitial = {
    type: inv.type,
    invoiceNumber: inv.invoiceNumber,
    invoiceDate: inv.invoiceDate ? ymd(inv.invoiceDate) : '',
    poNumber: inv.poNumber ?? '',
    notes: inv.notes ?? '',
    discount: discountLine ? discountLine.unitPrice.abs().toString() : '',
    discountReason: discountLine?.description ?? '',
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
  const shootDate = booking ? ymd(booking.startsAt) : null
  const jobContext = { id: inv.project.id, name: inv.project.name, subtype: booking?.title ?? null, shootLabel, location: booking?.location ?? null }
  const clientContext = { name: c.displayName, email: inv.billingEmailSnapshot ?? c.email, phone: c.phone, address: clientAddress }

  const packages = isEditable
    ? (await listActivePackages()).map((p) => ({ id: p.id, name: p.name, price: p.basePriceInclGst.toString(), description: p.description, inclusions: p.inclusions, isAddOn: p.isAddOn }))
    : []

  return (
    <>
      <div className="print:hidden">
      <AppShell user={user} csrf={csrf} active="finance">
      <div>
        {/* Header (matches the Clients detail page: chevron back-link, ruled title, quiet actions). */}
        <Link href="/finance" className="inline-flex items-center gap-0.5 text-sm text-ink-muted transition-colors hover:text-ink">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          Payments
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold leading-tight text-ink">Invoice #{inv.invoiceNumber}</h1>
            <p className="mt-0.5 text-sm text-ink-muted">
              Status: <span className="font-semibold capitalize text-ink">{inv.status.toLowerCase().replace(/_/g, ' ')}</span>
              {' · '}{c.displayName} · <Link href={`/jobs/${inv.project.id}`} className="text-accent-ink hover:underline">{inv.project.name}</Link>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PrintButton
              label="Download PDF"
              className={QUIET_BTN}
              icon={<svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" /></svg>}
            />
            {inv.accessToken ? (
              <Link href={`/invoice/${inv.accessToken}`} target="_blank" className={QUIET_BTN}>
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-8 8M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" /></svg>
                Client view
              </Link>
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
          <InvoiceWorkspace
            csrf={csrf}
            invoiceId={inv.id}
            projectId={inv.project.id}
            editable={isEditable}
            canPay={canPay}
            amountPaid={inv.amountPaid.toNumber()}
            initial={wsInitial}
            shootDate={shootDate}
            job={jobContext}
            client={clientContext}
            packages={packages}
            paymentRows={paymentRows}
          />
        </div>

        {/* Invoice preview (demoted, screen only) */}
        <div className="mt-8">
          <CollapsiblePreview>
            <InvoiceDocument invoice={inv} />
          </CollapsiblePreview>
        </div>
      </div>
      </AppShell>
      </div>

      {/* Print target: only the invoice sheet prints, so the PDF is the invoice alone — one page for a
          short invoice, with no app chrome and no blank trailing pages. */}
      <InvoiceFit />
      <div className="hidden print:block">
        <InvoiceDocument invoice={inv} />
      </div>
    </>
  )
}
