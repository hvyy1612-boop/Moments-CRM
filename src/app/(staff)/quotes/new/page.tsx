import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { formatSydneyDate } from '@/lib/time'
import { PageHeader } from '@/components/PageHeader'
import { DASHBOARD_CRUMB } from '@/components/Breadcrumb'
import { Button } from '@/components/ui/Button'
import { AppShell } from '../../AppShell'
import { PageContainer } from '@/components/PageContainer'
import { createQuoteForEnquiryAction } from '../actions'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Create quote - Moments' }

/** Create quote (docs/31): choose the enquiry the quote is for. A quote always belongs to an enquiry. */
export default async function CreateQuotePage() {
  const user = await requireRole('/quotes/new')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const enquiries = await prisma.enquiry.findMany({
    where: { status: { in: ['NEW', 'CONTACTED', 'QUALIFIED'] } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, eventType: true, createdAt: true, client: { select: { displayName: true } } },
    take: 100,
  })

  return (
    <AppShell user={user} csrf={csrf} active="quotes">
      <PageContainer variant="narrow">
      <PageHeader breadcrumb={[DASHBOARD_CRUMB, { label: 'Quotes', href: '/quotes' }, { label: 'New quote' }]} title="Create quote" description="Choose the enquiry this quote is for." />

      {enquiries.length === 0 ? (
        <p className="rounded-md border border-dashed border-line bg-paper px-4 py-10 text-center text-sm text-ink-muted">
          No open enquiries to quote. Quotes are created from an enquiry.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {enquiries.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface px-4 py-3">
              <div className="min-w-0">
                <div className="truncate font-medium text-ink">{e.client?.displayName ?? e.name}</div>
                <div className="text-xs text-muted">{e.eventType ?? 'Enquiry'} · {formatSydneyDate(e.createdAt)}</div>
              </div>
              <form action={createQuoteForEnquiryAction}>
                <input type="hidden" name="csrf" value={csrf} />
                <input type="hidden" name="enquiryId" value={e.id} />
                <Button type="submit" size="sm">Create quote</Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
    </AppShell>
  )
}
