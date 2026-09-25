import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { maskEmail } from '@/lib/text'
import { formatSydneyDateTime } from '@/lib/time'
import { PageHeader } from '@/components/PageHeader'
import { DASHBOARD_CRUMB } from '@/components/Breadcrumb'
import { AppShell } from '../AppShell'
import { PageContainer } from '@/components/PageContainer'
import { SignInTable, type SignInRow } from './SignInTable'
import { AuditTable, type AuditRow } from './AuditTable'
import { auditCategory, auditLabel, signInLabel } from './audit'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Activity - Moments' }

export default async function ActivityPage() {
  // ADMIN only (SEC-A01): this page exposes sign-in history and IP addresses for security review.
  const user = await requireRole('/activity')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  // Read-only. Both tables are append-only at the database level (the app never updates or deletes these
  // records), so the trail cannot be edited or erased. We never select the password hash or session token.
  const [logins, actions] = await Promise.all([
    prisma.signInLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 60,
      select: { id: true, eventType: true, outcome: true, emailAttempted: true, ipAddress: true, createdAt: true },
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, action: true, createdAt: true, actor: { select: { name: true } } },
    }),
  ])

  const signInRows: SignInRow[] = logins.map((e) => ({
    id: e.id,
    when: formatSydneyDateTime(e.createdAt),
    event: signInLabel(e.eventType),
    account: e.emailAttempted ? maskEmail(e.emailAttempted) : '-',
    ip: e.ipAddress ?? '-',
    success: e.outcome === 'SUCCESS',
    outcome: e.outcome.toLowerCase(),
  }))

  const auditRows: AuditRow[] = actions.map((a) => ({
    id: a.id,
    when: formatSydneyDateTime(a.createdAt),
    category: auditCategory(a.action),
    label: auditLabel(a.action),
    by: a.actor?.name ?? 'System',
  }))

  return (
    <AppShell user={user} csrf={csrf} active="activity">
      <PageContainer variant="standard">
        <PageHeader
          breadcrumb={[DASHBOARD_CRUMB, { label: 'Activity' }]}
          title="Activity"
          description="Security and account activity for this workspace - sign-ins and important actions. Times are Sydney local, emails are masked, and IP addresses are shown for security review. Read-only: records cannot be edited or deleted."
        />

        <section className="mt-8">
          <h2 className="text-sm font-semibold text-ink">Sign-in activity</h2>
          <p className="mt-0.5 text-xs text-muted">Successful and failed sign-ins, with the IP address for spotting unusual access.</p>
          <div className="mt-3">
            <SignInTable rows={signInRows} />
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-semibold text-ink">Account &amp; workspace activity</h2>
          <p className="mt-0.5 text-xs text-muted">Who changed what - user administration and key business actions, grouped by area.</p>
          <div className="mt-3">
            <AuditTable rows={auditRows} />
          </div>
        </section>
      </PageContainer>
    </AppShell>
  )
}
