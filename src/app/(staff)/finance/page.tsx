import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { getInvoiceBalance } from '@/lib/domain/money'
import { INVOICE_MONEY_SELECT, toInvoiceMoneyInput } from '@/lib/domain/invoice-money'
import { formatAud } from '@/lib/money'
import { AppShell } from '../AppShell'
import { PaymentsView } from './PaymentsView'
import { type Row } from './InvoiceTable'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Payments - Moments' }

export default async function FinancePage() {
  const user = await requireRole('/finance')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const invoices = await prisma.invoice.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      invoiceNumber: true,
      issuedAt: true,
      project: { select: { id: true, client: { select: { displayName: true } } } },
      ...INVOICE_MONEY_SELECT, // status, total, dueAt + the ledger facts for the balance
    },
  })

  // Balance per row is the ledger-derived `owed` (credit-aware, overpayment clamped) — one derivation
  // shared with the invoice detail and job views (docs/25 Part 1). The nested select keeps it a single
  // query, so the list stays free of N+1. Grouping + active search now live in the client PaymentsView.
  const rows: Row[] = invoices.map((inv) => ({
    id: inv.id,
    number: inv.invoiceNumber,
    client: inv.project.client.displayName,
    status: inv.status,
    issued: inv.issuedAt,
    due: inv.dueAt,
    total: formatAud(inv.total),
    balance: formatAud(getInvoiceBalance(toInvoiceMoneyInput(inv)).owed),
  }))

  return (
    <AppShell user={user} csrf={csrf} active="finance" bareHeader>
      <div className="w-full max-w-6xl">
        {/* Header (shared PageHeader pattern: uppercase section eyebrow, then title + description). */}
        <div className="text-xs font-semibold uppercase tracking-widest text-muted">Operations</div>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-ink">Payments</h1>
            <p className="mt-1 text-sm text-ink-muted">Track invoices, balances and payment status.</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Search moved into PaymentsView's active-search field (client-side, live, across groups). */}
            <Link
              href="/finance/new"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-sunk"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New invoice
            </Link>
          </div>
        </div>

        {/* Active search + grouped tables (Outstanding / Paid / Draft & void). */}
        <div className="mt-7">
          <PaymentsView rows={rows} />
        </div>
      </div>
    </AppShell>
  )
}
