import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { formatAud } from '@/lib/money'
import { formatSydneyDate, sydneyDateTimeParts } from '@/lib/time'
import { titleCase } from '@/lib/text'
import { AppShell } from '../AppShell'
import { PageContainer } from '@/components/PageContainer'
import { PageHeader } from '@/components/PageHeader'
import { DASHBOARD_CRUMB } from '@/components/Breadcrumb'
import { PaymentsView, type Row } from './PaymentsView'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Payments - Moments' }

function sydneyDay(date: Date): number {
  const parts = sydneyDateTimeParts(date).date.split('-')
  const y = Number(parts[0])
  const m = Number(parts[1])
  const d = Number(parts[2])
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000)
}

function urgencyFor(due: Date | null, now: Date): { label: string; tone: 'over' | 'soon' } | null {
  if (!due) return null
  const days = sydneyDay(due) - sydneyDay(now)
  if (days < 0) {
    const n = -days
    return { label: `${n} day${n > 1 ? 's' : ''} past due`, tone: 'over' }
  }
  if (days === 0) return { label: 'Due today', tone: 'soon' }
  if (days <= 7) return { label: `Due in ${days} day${days > 1 ? 's' : ''}`, tone: 'soon' }
  return null
}

export default async function FinancePage() {
  const user = await requireRole('/finance')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const invoices = await prisma.invoice.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      total: true,
      dueAt: true,
      issuedAt: true,
      project: {
        select: {
          client: { select: { displayName: true } },
          package: { select: { name: true } },
          convertedFromEnquiries: { select: { eventType: true }, take: 1 },
        },
      },
      payments: {
        select: { transactions: { where: { status: 'SUCCEEDED', type: 'CHARGE' }, select: { createdAt: true } } },
      },
    },
  })

  const now = new Date()
  const rows: Row[] = invoices.flatMap((inv) => {
    if (inv.status === 'VOID') return []
    const isPaid = inv.status === 'PAID'
    const isDraft = inv.status === 'DRAFT'
    const charges = inv.payments.flatMap((p) => p.transactions)
    const paidAt = charges.length ? new Date(Math.max(...charges.map((c) => c.createdAt.getTime()))) : inv.issuedAt
    const service = titleCase(
      inv.project.convertedFromEnquiries[0]?.eventType ?? inv.project.package?.name ?? 'Photography',
    )
    const dateSource = isPaid ? paidAt : isDraft ? null : inv.dueAt
    const urgency = !isPaid && !isDraft ? urgencyFor(inv.dueAt, now) : null
    return [
      {
        id: inv.id,
        number: inv.invoiceNumber,
        client: inv.project.client.displayName,
        service,
        group: isPaid ? ('paid' as const) : ('unpaid' as const),
        amount: formatAud(inv.total),
        amountNum: inv.total.toNumber(),
        dateKind: isDraft ? ('draft' as const) : isPaid ? ('paid' as const) : ('due' as const),
        dateLabel: dateSource ? formatSydneyDate(dateSource) : null,
        urgencyLabel: urgency?.label ?? null,
        urgencyTone: urgency?.tone ?? null,
      },
    ]
  })

  return (
    <AppShell user={user} csrf={csrf} active="finance" bareHeader>
      <PageContainer variant="full">
        <PageHeader
          breadcrumb={[DASHBOARD_CRUMB, { label: 'Payments' }]}
          title="Payments"
          actions={
            <Link
              href="/finance/new"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-sunk"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New invoice
            </Link>
          }
        />

        <PaymentsView rows={rows} csrf={csrf} />
      </PageContainer>
    </AppShell>
  )
}
