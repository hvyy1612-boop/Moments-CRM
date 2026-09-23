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
import { StatusPill, type Tone } from '@/components/ui/StatusPill'
import { AppShell } from '../AppShell'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Quotes - Moments' }

/**
 * Quotes list (docs/31): quotes are first-class business records, sitting between Enquiries and Jobs in
 * the lifecycle. Each row links to the quote; accepting a quote is what turns its enquiry into a Job.
 */

const STATUS_TONE: Record<string, Tone> = {
  DRAFT: 'neutral',
  SENT: 'info',
  VIEWED: 'info',
  ACCEPTED: 'good',
  DECLINED: 'bad',
  EXPIRED: 'warn',
  SUPERSEDED: 'neutral',
}
const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase()

export default async function QuotesPage() {
  const user = await requireRole('/quotes')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''
  const quotes = await listQuotes()

  return (
    <AppShell user={user} csrf={csrf} active="quotes">
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

      {quotes.length === 0 ? (
        <p className="rounded-md border border-dashed border-line bg-paper px-4 py-10 text-center text-sm text-ink-muted">
          No quotes yet. Create one from an enquiry to get started.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2.5 font-medium">Quote</th>
                <th className="px-4 py-2.5 font-medium">Client</th>
                <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => (
                <tr key={q.id} className="border-b border-line last:border-b-0 hover:bg-paper">
                  <td className="px-4 py-2.5">
                    <Link href={`/quotes/${q.id}`} className="font-medium text-ink hover:text-accent">{q.number}</Link>
                  </td>
                  <td className="px-4 py-2.5 text-ink">{q.clientName}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink">{formatAud(q.total)}</td>
                  <td className="px-4 py-2.5"><StatusPill tone={STATUS_TONE[q.status] ?? 'neutral'}>{label(q.status)}</StatusPill></td>
                  <td className="px-4 py-2.5 text-ink-muted">{formatSydneyDate(q.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  )
}
