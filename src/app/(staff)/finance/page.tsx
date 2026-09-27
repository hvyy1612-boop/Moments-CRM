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
import { PageContainer } from '@/components/PageContainer'
import { PageHeader } from '@/components/PageHeader'
import { DASHBOARD_CRUMB } from '@/components/Breadcrumb'
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
      <PageContainer variant="standard">
        <PageHeader
          breadcrumb={[DASHBOARD_CRUMB, { label: 'Payments' }]}
          title="Payments"
          description="Track invoices, balances and payment status."
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

        {/* Active search + grouped tables (Outstanding / Paid / Draft & void). */}
        <div className="mt-7">
          <PaymentsView rows={rows} />
        </div>
      </PageContainer>
    </AppShell>
  )
}
