import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { StatusPill } from '@/components/ui/StatusPill'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { maskEmail } from '@/lib/text'
import { formatSydneyDateTime } from '@/lib/time'
import { AppShell } from '../AppShell'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Activity — Moments' }

function humanEvent(eventType: string): string {
  return eventType.toLowerCase().replace(/_/g, ' ')
}

export default async function ActivityPage() {
  // ADMIN only: this page exposes login history and IP addresses (SEC-A01, declared in permissions).
  const user = await requireRole('/activity')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  // Read-only. Both tables are append-only at the database level (insert-only triggers), so nothing
  // here can be edited or erased. We never select the password hash or session token.
  const [logins, actions] = await Promise.all([
    prisma.signInLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        eventType: true,
        outcome: true,
        emailAttempted: true,
        ipAddress: true,
        createdAt: true,
      },
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        action: true,
        entityType: true,
        createdAt: true,
        actor: { select: { name: true } },
      },
    }),
  ])

  return (
    <AppShell user={user} csrf={csrf} active="activity">
      <div>
        <h1 className="font-serif text-2xl text-ink">Activity</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Sign-in history and a record of what happened. Read-only: nothing here can be changed.
        </p>

        <section className="mt-8">
          <h2 className="text-lg">Sign-in activity</h2>
          <div className="mt-3 overflow-x-auto rounded border border-line bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-ink-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">Event</th>
                  <th className="px-4 py-2 font-medium">Account</th>
                  <th className="px-4 py-2 font-medium">IP address</th>
                  <th className="px-4 py-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {logins.length === 0 ? (
                  <tr>
                    <td className="px-4 py-3 text-ink-muted" colSpan={5}>
                      No sign-in events yet.
                    </td>
                  </tr>
                ) : (
                  logins.map((event) => (
                    <tr key={event.id} className="border-b border-line last:border-b-0">
                      <td className="whitespace-nowrap px-4 py-2 text-ink-muted">
                        {formatSydneyDateTime(event.createdAt)}
                      </td>
                      <td className="px-4 py-2 text-ink">{humanEvent(event.eventType)}</td>
                      <td className="px-4 py-2 text-ink">
                        {event.emailAttempted ? maskEmail(event.emailAttempted) : '-'}
                      </td>
                      <td className="px-4 py-2 text-ink-muted">{event.ipAddress}</td>
                      <td className="px-4 py-2">
                        <StatusPill tone={event.outcome === 'SUCCESS' ? 'good' : 'bad'}>
                          {event.outcome.toLowerCase()}
                        </StatusPill>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg">Activity log</h2>
          <div className="mt-3 overflow-x-auto rounded border border-line bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-ink-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">Action</th>
                  <th className="px-4 py-2 font-medium">On</th>
                  <th className="px-4 py-2 font-medium">By</th>
                </tr>
              </thead>
              <tbody>
                {actions.length === 0 ? (
                  <tr>
                    <td className="px-4 py-3 text-ink-muted" colSpan={4}>
                      No activity recorded yet.
                    </td>
                  </tr>
                ) : (
                  actions.map((entry) => (
                    <tr key={entry.id} className="border-b border-line last:border-b-0">
                      <td className="whitespace-nowrap px-4 py-2 text-ink-muted">
                        {formatSydneyDateTime(entry.createdAt)}
                      </td>
                      <td className="px-4 py-2 text-ink">{humanEvent(entry.action)}</td>
                      <td className="px-4 py-2 text-ink-muted">{entry.entityType}</td>
                      <td className="px-4 py-2 text-ink-muted">{entry.actor?.name ?? 'System'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  )
}
