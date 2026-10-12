import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { getRecentAlerts } from '@/lib/domain/alerts'
import { PageHeader } from '@/components/PageHeader'
import { DASHBOARD_CRUMB } from '@/components/Breadcrumb'
import { PageContainer } from '@/components/PageContainer'
import { AppShell } from '../AppShell'
import { NotificationsList } from './NotificationsList'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Notifications - Moments' }

/**
 * "See all notifications": the full list behind the top-nav bell. Real events (new enquiries, payments
 * received) AND standing alerts (overdue payments, upcoming shoots), with All / Unread / Alerts tabs and
 * Mark all read, driven by the per-user seen marker.
 */
export default async function NotificationsPage() {
  const user = await requireRole('/notifications')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const [alerts, me] = await Promise.all([
    getRecentAlerts(50),
    prisma.user.findUnique({ where: { id: user.id }, select: { notificationsSeenAt: true } }),
  ])

  return (
    <AppShell user={user} csrf={csrf} active="dashboard">
      <PageContainer variant="standard">
        <PageHeader breadcrumb={[DASHBOARD_CRUMB, { label: 'Notifications' }]} title="Notifications" />
        <NotificationsList alerts={alerts} seenAt={me?.notificationsSeenAt ?? null} />
      </PageContainer>
    </AppShell>
  )
}
