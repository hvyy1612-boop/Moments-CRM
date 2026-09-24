import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { listQuotes } from '@/lib/domain/quote'
import { formatAud } from '@/lib/money'
import { formatSydneyDate } from '@/lib/time'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/Button'
import { AppShell } from '../AppShell'
import { PageContainer } from '@/components/PageContainer'
import { QuotesTable, type QuoteRow } from './QuotesTable'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Quotes - Moments' }

/**
 * Quotes list (docs/31): quotes are first-class business records, sitting between Enquiries and Jobs in
 * the lifecycle. Each row links to the quote; accepting a quote is what turns its enquiry into a Job.
 * Rendered through the shared DataTable (QuotesTable) so it matches every other list page.
 */
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
      <PageContainer variant="standard">
        <PageHeader
          eyebrow="Studio"
          title="Quotes"
          description="Quotations you have prepared. Create a quote from an enquiry; when the client accepts, it becomes a job."
          actions={
            <div className="flex gap-2">
              <Link href="/pricing"><Button variant="secondary" size="sm">Quick calculation</Button></Link>
              <Link href="/quotes/new"><Button size="sm">Create quote</Button></Link>
            </div>
          }
        />

        <div className="mt-4">
          <QuotesTable rows={rows} />
        </div>
      </PageContainer>
    </AppShell>
  )
}
