import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { can } from '@/lib/auth/authz'
import { requireRole } from '@/lib/auth/guard'
import { listQuotes } from '@/lib/domain/quote'
import { formatAud } from '@/lib/money'
import { formatSydneyDate } from '@/lib/time'
import { PageHeader } from '@/components/PageHeader'
import { DASHBOARD_CRUMB } from '@/components/Breadcrumb'
import { buttonClass } from '@/components/ui/Button'
import { AppShell } from '../AppShell'
import { PageContainer } from '@/components/PageContainer'
import { QuotesTable, type QuoteRow } from './QuotesTable'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Quotes - Moments' }

export default async function QuotesPage() {
  const user = await requireRole('/quotes')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''
  const quotes = await listQuotes()

  const rows: QuoteRow[] = quotes.map((q) => ({
    id: q.id,
    number: q.number,
    client: q.clientName,
    amount: formatAud(q.total),
    status: q.status,
    updated: formatSydneyDate(q.updatedAt),
  }))

  return (
    <AppShell user={user} csrf={csrf} active="quotes">
      {/* Content measure so the table fills a normal wide screen without sprawling (shared with the other lists). */}
      <PageContainer variant="full">
        <PageHeader
          breadcrumb={[DASHBOARD_CRUMB, { label: 'Quotes' }]}
          title="Quotes"
          actions={
            <div className="flex gap-2">
              <Link href="/pricing" className={buttonClass('secondary', 'sm')}>Quick calculation</Link>
              <Link href="/quotes/new" className={buttonClass('primary', 'sm')}>Create quote</Link>
            </div>
          }
        />

        <QuotesTable rows={rows} csrf={csrf} canDeleteQuotes={can(user, 'MONEY_ADMIN')} />
      </PageContainer>
    </AppShell>
  )
}
