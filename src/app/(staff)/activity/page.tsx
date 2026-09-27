import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { maskEmail } from '@/lib/text'
import { formatSydneyDateTime } from '@/lib/time'
import { PageHeader } from '@/components/PageHeader'
import { DASHBOARD_CRUMB } from '@/components/Breadcrumb'
import { STEPUP_COOKIE, hasStepUp } from '@/lib/auth/stepup'
import { getActivityPinStatus } from '@/lib/auth/activity-pin'
import { AppShell } from '../AppShell'
import { PageContainer } from '@/components/PageContainer'
import { SignInTable, type SignInRow } from './SignInTable'
import { AuditTable, type AuditRow } from './AuditTable'
import { ActivityGate } from './ActivityGate'
import { auditCategory, auditLabel, signInLabel } from './audit'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Activity - Moments' }

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {

  const user = await requireRole('/activity')
  const store = await cookies()
  const cookieValue = store.get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  if (!hasStepUp(store.get(STEPUP_COOKIE)?.value, user.id)) {
    const pin = await getActivityPinStatus(user.id)
    return (
      <AppShell user={user} csrf={csrf} active="activity">
        <PageContainer variant="narrow">
          <PageHeader
            breadcrumb={[DASHBOARD_CRUMB, { label: 'Activity' }]}
            title="Activity"
            description="Security and account activity for this workspace. Read-only, admin-only."
          />
          <ActivityGate csrf={csrf} pinIsSet={pin.isSet} locked={pin.lockedUntil !== null} />
        </PageContainer>
      </AppShell>
    )
  }

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

  const sp = await searchParams
  const view: 'signins' | 'activity' = sp?.view === 'activity' ? 'activity' : 'signins'
  const tabHref = (v: 'signins' | 'activity') => (v === 'activity' ? '/activity?view=activity' : '/activity')
  const TABS = [
    ['signins', 'Sign-in activity', signInRows.length],
    ['activity', 'Account & workspace activity', auditRows.length],
  ] as const
  const blurb =
    view === 'signins'
      ? 'Successful and failed sign-ins, with the IP address for spotting unusual access.'
      : 'Who changed what - user administration and key business actions, grouped by area.'

  return (
    <AppShell user={user} csrf={csrf} active="activity">
      <PageContainer variant="standard">
        <PageHeader
          breadcrumb={[DASHBOARD_CRUMB, { label: 'Activity' }]}
          title="Activity"
          description="Security and account activity for this workspace - sign-ins and important actions. Times are Sydney local, emails are masked, and IP addresses are shown for security review. Read-only: records cannot be edited or deleted."
        />

        <div className="mt-7 border-b border-line pb-2">
          <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Activity view">
            {TABS.map(([key, label, count]) => {
              const on = view === key
              return (
                <Link
                  key={key}
                  href={tabHref(key)}
                  role="tab"
                  aria-selected={on}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${on ? 'bg-sunk font-medium text-ink' : 'text-ink-muted hover:bg-paper hover:text-ink'}`}
                >
                  {label}
                  <span className={`tabular rounded-full px-1.5 py-0.5 text-xs leading-none ${on ? 'bg-line text-ink-muted' : 'bg-sunk text-ink-muted'}`}>{count}</span>
                </Link>
              )
            })}
          </div>
        </div>

        <section className="mt-5">
          <p className="text-xs text-muted">{blurb}</p>
          <div className="mt-3">
            {view === 'signins' ? <SignInTable rows={signInRows} /> : <AuditTable rows={auditRows} />}
          </div>
        </section>
      </PageContainer>
    </AppShell>
  )
}
