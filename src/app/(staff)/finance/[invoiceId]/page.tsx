import type { Metadata } from 'next'
import { Prisma } from '@prisma/client'
import Link from 'next/link'
import { Breadcrumb, DASHBOARD_CRUMB } from '@/components/Breadcrumb'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { InvoiceDocument } from '@/components/InvoiceDocument'
import { InvoiceFit } from '@/components/InvoiceFit'
import { SentToast } from '@/components/ui/SentToast'
import { StatusPill } from '@/components/ui/StatusPill'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { can } from '@/lib/auth/authz'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { JOB_SHOOT_SELECT } from '@/lib/domain/deadline'
import { getInvoiceBalanceById } from '@/lib/domain/invoice-money'
import { nextPaymentDue } from '@/lib/domain/money'
import { formatAud } from '@/lib/money'
import { formatSydneyDate, formatSydneyTime, sydneyYmd } from '@/lib/time'
import { titleCase } from '@/lib/text'
import {
  describeInvoiceEvent,
  instalmentStatus,
  invoiceStatusView,
} from '@/features/finance/invoice-detail'
import { AppShell } from '../../AppShell'
import { PageContainer } from '@/components/PageContainer'
import { InvoiceHeaderActions } from './InvoiceHeaderActions'
import { InvoicePreview } from './InvoicePreview'
import { HistoryLog, type HistoryRow } from './HistoryLog'
import { RecordPaymentDialog } from './RecordPaymentDialog'
import { RefundButton } from './RefundButton'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Invoice - Moments' }

function ymd(date: Date): string {
  const { year, month, day } = sydneyYmd(date)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
const cents = (d: Prisma.Decimal) => Math.round(d.toNumber() * 100)

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ invoiceId: string }>
  searchParams: Promise<{ sent?: string }>
}) {
  const user = await requireRole('/finance/[invoiceId]')
  const { invoiceId } = await params
  const sp = await searchParams
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true, invoiceNumber: true, type: true, status: true, subtotal: true, taxTotal: true, total: true,
      amountPaid: true, invoiceDate: true, dueAt: true, poNumber: true, notes: true, accessToken: true,
      billingNameSnapshot: true, billingEmailSnapshot: true, billingJobNameSnapshot: true,
      creditNotes: { select: { amount: true } },
      lines: { orderBy: { sortOrder: 'asc' }, select: { itemName: true, description: true, quantity: true, unitPrice: true, discount: true, lineTotal: true } },
      instalments: { orderBy: { sortOrder: 'asc' }, select: { label: true, dueAt: true, amount: true } },
      payments: {
        orderBy: { receivedAt: 'desc' },
        select: {
          id: true, amount: true, paymentMethod: true, receivedAt: true, status: true,
          transactions: { where: { type: 'CHARGE' }, take: 1, select: { metadata: true } },
          refunds: { select: { amount: true } },
        },
      },
      project: {
        select: {
          id: true, name: true, code: true,
          client: { select: { id: true, displayName: true, email: true, phone: true, street: true, suburb: true, state: true, postcode: true, country: true } },
          company: { select: { name: true, abn: true, settings: true } },
          ...JOB_SHOOT_SELECT,
        },
      },
    },
  })
  if (!inv) notFound()

  const paymentIds = inv.payments.map((p) => p.id)
  const [balance, audits] = await Promise.all([
    getInvoiceBalanceById(inv.id),
    prisma.auditLog.findMany({
      where: {
        OR: [
          { entityType: 'Invoice', entityId: inv.id },
          ...(paymentIds.length > 0 ? [{ entityType: 'Payment', entityId: { in: paymentIds } }] : []),
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
      select: { id: true, action: true, afterData: true, createdAt: true, entityId: true, actor: { select: { name: true } } },
    }),
  ])

  const docCredits = inv.creditNotes.reduce((s, cn) => s.add(cn.amount), new Prisma.Decimal(0))
  const status = inv.status
  const unpaid = inv.amountPaid.lte(0)
  const isEditable = unpaid && status !== 'VOID' && status !== 'PAID' && status !== 'PARTIALLY_PAID'

  const moneyAdmin = can(user, 'MONEY_ADMIN')
  const canVoid = moneyAdmin && unpaid && status !== 'VOID'
  const c = inv.project.client
  const clientName = inv.billingNameSnapshot ?? c.displayName
  const jobName = inv.billingJobNameSnapshot ?? inv.project.name

  const todayYmd = ymd(new Date())
  const refundedOf = (p: (typeof inv.payments)[number]) => p.refunds.reduce((s, r) => s.add(r.amount), new Prisma.Decimal(0))
  const instalments = balance?.instalments ?? []
  const single = instalments.length <= 1
  const rowCents = instalments.map((it) => cents(it.amount))
  const scheduleRows = instalments.map((it, i) => {
    const due = it.dueAt ?? (single ? inv.dueAt ?? inv.invoiceDate : null)
    const dueYmd = due ? ymd(due) : null
    return {
      key: i,
      label: it.label ?? (single ? 'Full payment' : `Payment ${i + 1}`),
      status: instalmentStatus(it.state, dueYmd, todayYmd, status),
      dueLabel: due ? formatSydneyDate(due) : 'On issue',
      isToday: dueYmd === todayYmd,
      amount: formatAud(new Prisma.Decimal(rowCents[i]! / 100)),
    }
  })
  const scheduleName = single ? 'No split payments' : `Split into ${instalments.length} payments`
  const balanceDue =
    status === 'VOID' ? new Prisma.Decimal(0)
    : balance?.owed ?? new Prisma.Decimal(0)
  const canPay = status !== 'PAID' && status !== 'VOID' && balanceDue.greaterThan(0)

  const paymentRows = inv.payments.map((p) => {
    const refunded = refundedOf(p)
    const refundable = p.amount.sub(refunded)
    const meta = p.transactions[0]?.metadata as Record<string, unknown> | null | undefined
    return {
      id: p.id,
      date: p.receivedAt ? formatSydneyDate(p.receivedAt) : '-',
      method: titleCase(p.paymentMethod.toLowerCase().replace(/_/g, ' ')),
      reference: meta && typeof meta.reference === 'string' ? meta.reference : null,
      amount: formatAud(p.amount),
      refunded: refunded.greaterThan(0) ? formatAud(refunded) : null,
      refundable: refundable.toString(),
      canRefund: moneyAdmin && refundable.greaterThan(0) && status !== 'VOID',
    }
  })

  const methodOf = new Map(inv.payments.map((p) => [p.id, p.paymentMethod as string]))
  const historyRows: HistoryRow[] = audits.flatMap((a) => {
    const d = describeInvoiceEvent({ action: a.action, afterData: a.afterData, invoiceNumber: inv.invoiceNumber, paymentMethod: methodOf.get(a.entityId) ?? null })
    return d
      ? [{ id: a.id, date: formatSydneyDate(a.createdAt), time: formatSydneyTime(a.createdAt), user: a.actor?.name ?? 'System', action: d.action, details: d.details }]
      : []
  })

  const nextDue = balance ? (nextPaymentDue(balance) ?? inv.dueAt) : inv.dueAt
  const isOverdue =
    status !== 'PAID' && status !== 'VOID' && balanceDue.greaterThan(0) && nextDue != null && ymd(nextDue) < todayYmd
  const statusView = invoiceStatusView(status, { overdue: isOverdue })
  const doc = <InvoiceDocument invoice={{ ...inv, creditsTotal: docCredits }} />

  return (
    <>
      <div className="print:hidden">
        <AppShell user={user} csrf={csrf} active="finance">
          <PageContainer variant="standard">
            {sp.sent !== undefined ? <SentToast email={sp.sent} label="Invoice sent" /> : null}
            <Breadcrumb items={[DASHBOARD_CRUMB, { label: 'Payments', href: '/finance' }, { label: `Invoice #${inv.invoiceNumber}` }]} />

            {/* Header: number + status, client and job, then the actions in one row. */}
            <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-semibold leading-tight text-ink">Invoice #{inv.invoiceNumber}</h1>
                  <StatusPill tone={statusView.tone}>{statusView.label}</StatusPill>
                </div>
                <p className="mt-1 text-sm text-ink-muted">
                  <Link href={`/clients/${c.id}`} className="hover:text-ink hover:underline">{clientName}</Link>
                  {' · '}
                  <Link href={`/jobs/${inv.project.id}`} className="hover:text-ink hover:underline">{jobName}</Link>
                </p>
              </div>
              <InvoiceHeaderActions
                csrf={csrf}
                invoiceId={inv.id}
                projectId={inv.project.id}
                invoiceNumber={inv.invoiceNumber}
                status={status}
                everSent={audits.some((a) => a.action === 'invoice.sent')}
                clientName={clientName}
                clientEmail={inv.billingEmailSnapshot ?? c.email ?? ''}
                clientViewHref={inv.accessToken ? `/invoice/${inv.accessToken}` : null}
                editHref={isEditable ? `/finance/${inv.id}/edit` : null}
                canVoid={canVoid}
                canDelete={moneyAdmin && unpaid && inv.payments.length === 0 }
              />
            </div>

            <div className="mt-6 flex flex-col gap-6">
              {/* Payment schedule */}
              <section className="rounded-md border border-line bg-surface">
                <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-3 pt-4">
                  <div>
                    <h2 className="text-base font-semibold text-ink">Payment schedule</h2>
                    <p className="mt-0.5 text-sm text-ink-muted">{scheduleName}</p>
                  </div>
                  {canPay ? (
                    <RecordPaymentDialog
                      csrf={csrf}
                      projectId={inv.project.id}
                      invoiceId={inv.id}
                      balance={balanceDue.toFixed(2)}
                      balanceLabel={formatAud(balanceDue)}
                      primary={status !== 'ISSUED'}
                    />
                  ) : null}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed text-sm">
                    <thead>
                      <tr className="bg-sunk text-left text-ink">
                        <th scope="col" className="border-r border-line px-5 py-3 font-semibold">Status</th>
                        {single ? null : <th scope="col" className="hidden border-r border-line px-5 py-3 font-semibold sm:table-cell">Payment</th>}
                        <th scope="col" className="border-r border-line px-5 py-3 font-semibold">Due date</th>
                        <th scope="col" className="px-5 py-3 text-right font-semibold">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scheduleRows.map((r) => (

                        <tr key={r.key} className="border-t border-line align-top">
                          <td className="border-r border-line px-5 py-4"><StatusPill tone={r.status.tone}>{r.status.label}</StatusPill></td>
                          {single ? null : <td className="hidden border-r border-line px-5 py-4 text-ink sm:table-cell">{r.label}</td>}
                          <td className="border-r border-line px-5 py-4 tabular text-ink">
                            <span className="whitespace-nowrap">{r.dueLabel}</span>
                            {r.isToday ? <>{' '}<span className="whitespace-nowrap text-ink-muted">(today)</span></> : null}
                            {single ? null : <span className="block text-xs text-ink-muted sm:hidden">{r.label}</span>}
                          </td>
                          <td className="tabular whitespace-nowrap px-5 py-4 text-right text-ink">{r.amount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-baseline justify-end gap-8 border-t border-line px-5 py-4">
                  <span className="text-sm text-ink-muted">Balance due</span>
                  <span className="tabular text-lg font-semibold text-ink">{formatAud(balanceDue)}</span>
                </div>

                {paymentRows.length > 0 ? (

                  <div className="border-t border-line px-5 pb-2 pt-4">
                    <h3 className="text-sm font-semibold text-ink">Payments received</h3>
                    <div className="overflow-x-auto">
                      <table className="mt-1 w-full text-sm">
                        <tbody>
                          {paymentRows.map((p) => (
                            <tr key={p.id} className="border-b border-line align-top last:border-b-0">
                              <td className="tabular whitespace-nowrap py-3 pr-4 text-ink">
                                {p.date}
                                <span className="block text-xs text-ink-muted sm:hidden">{p.method}</span>
                              </td>
                              <td className="hidden py-3 pr-4 text-ink-muted sm:table-cell">
                                {p.method}
                                {p.reference ? <span className="block text-xs">{p.reference}</span> : null}
                              </td>
                              <td className="tabular whitespace-nowrap py-3 pr-4 text-right text-ink">
                                {p.amount}
                                {p.refunded ? <span className="block text-xs text-danger">-{p.refunded} refunded</span> : null}
                              </td>
                              <td className="py-3 text-right">
                                {p.canRefund ? <RefundButton csrf={csrf} paymentId={p.id} invoiceId={inv.id} refundable={p.refundable} /> : null}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </section>

              {/* The invoice exactly as the client receives it. */}
              <InvoicePreview>{doc}</InvoicePreview>

              <HistoryLog rows={historyRows} />
            </div>
          </PageContainer>
        </AppShell>
      </div>

      {/* Print target: only the invoice sheet prints, so the PDF is the invoice alone - one page for a
          short invoice, with no app chrome and no blank trailing pages. */}
      <InvoiceFit />
      <div className="hidden print:block">
        <InvoiceDocument invoice={{ ...inv, creditsTotal: docCredits }} />
      </div>
    </>
  )
}
