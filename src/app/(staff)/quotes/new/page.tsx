import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { formatSydneyDate } from '@/lib/time'
import { PageHeader } from '@/components/PageHeader'
import { DASHBOARD_CRUMB } from '@/components/Breadcrumb'
import { AppShell } from '../../AppShell'
import { PageContainer } from '@/components/PageContainer'
import { NewQuotePicker } from './NewQuotePicker'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Create quote - Moments' }

/** Create quote (docs/31): choose the enquiry the quote is for. A quote always belongs to an enquiry. */
export default async function CreateQuotePage() {
  const user = await requireRole('/quotes/new')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const enquiries = await prisma.enquiry.findMany({
    where: { status: { in: ['NEW_ENQUIRY', 'CONTACTED', 'CONSULTATION', 'QUOTE_SENT'] } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, enquiryNumber: true, name: true, eventType: true, createdAt: true, client: { select: { displayName: true } } },
    // Every OPEN lead must be choosable (the picker searches in the browser); 100 hid older open leads.
    // This is only the open pipeline, so the cap is a safety net, not a page size.
    take: 2000,
  })

  return (
    <AppShell user={user} csrf={csrf} active="quotes">
      <PageContainer variant="standard">
      <PageHeader breadcrumb={[DASHBOARD_CRUMB, { label: 'Quotes', href: '/quotes' }, { label: 'New quote' }]} title="Create quote" />

      <div className="mt-7">
        <NewQuotePicker
          csrf={csrf}
          rows={enquiries.map((e) => ({
            id: e.id,
            number: e.enquiryNumber,
            client: e.client?.displayName ?? e.name,
            event: e.eventType ?? '-',
            received: formatSydneyDate(e.createdAt),
          }))}
        />
      </div>
    </PageContainer>
    </AppShell>
  )
}
