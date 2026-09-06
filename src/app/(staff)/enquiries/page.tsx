import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { formatSydneyDate } from '@/lib/time'
import { titleCase } from '@/lib/text'
import { AppShell } from '../AppShell'
import { EnquiriesList } from './EnquiriesList'
import type { EnquiryRowData } from './EnquiryRow'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Enquiries - Moments' }

export default async function EnquiriesPage() {
  const user = await requireRole('/enquiries')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const enquiries = await prisma.enquiry.findMany({
    orderBy: { updatedAt: 'asc' }, // oldest-waiting first (the default sort)
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      eventType: true,
      eventDate: true,
      status: true,
      waitingOn: true,
      convertedProjectId: true,
      updatedAt: true,
      createdAt: true,
      workItems: {
        where: { status: { not: 'CANCELLED' } },
        orderBy: { order: 'asc' },
        select: { id: true, title: true, status: true },
      },
    },
  })

  const rows: EnquiryRowData[] = enquiries.map((e) => ({
    id: e.id,
    name: e.name,
    event: e.eventType ? titleCase(e.eventType) : 'Not specified',
    status: e.status,
    waitingOn: e.waitingOn,
    shootDate: e.eventDate ? formatSydneyDate(e.eventDate) : null,
    email: e.email,
    phone: e.phone,
    convertedProjectId: e.convertedProjectId,
    tasks: e.workItems.map((w) => ({ id: w.id, title: w.title, done: w.status === 'COMPLETED' })),
    waitingMs: e.updatedAt.getTime(),
    createdMs: e.createdAt.getTime(),
  }))

  return (
    <AppShell user={user} csrf={csrf} active="enquiries" bareHeader>
      <EnquiriesList rows={rows} csrf={csrf} />
    </AppShell>
  )
}
