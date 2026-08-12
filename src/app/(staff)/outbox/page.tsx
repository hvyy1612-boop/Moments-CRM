import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { EmptyState } from '@/components/ui/EmptyState'
import { StaffHeader } from '@/components/ui/StaffHeader'
import { StatusPill, type Tone } from '@/components/ui/StatusPill'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { formatSydneyDate } from '@/lib/time'

export const runtime = 'nodejs'

export const metadata: Metadata = { title: 'Outbox — Moments' }

const TONE: Record<string, Tone> = {
  QUEUED: 'info',
  SENT: 'good',
  CANCELLED: 'neutral',
  FAILED: 'bad',
}

/**
 * Every message the system has queued for a client or a staff member (D4: nothing is sent by a
 * mail server in development, so the queue itself is the outbox and the demo can show it).
 *
 * BR-L04: bodies are stored without secrets, but a reset link is one, so those bodies are masked
 * here rather than displayed.
 */
export default async function OutboxPage() {
  const user = await requireRole('/outbox') // SEC-A01

  const notifications = await prisma.notification.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      templateKey: true,
      recipient: true,
      subject: true,
      bodyText: true,
      status: true,
      scheduledFor: true,
      sentAt: true,
      cancelledReason: true,
      createdAt: true,
    },
  })
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  return (
    <>
      <StaffHeader user={user} csrf={csrf} />
      <main className="mx-auto w-full max-w-4xl px-4 py-8">
        <h1 className="text-xl">Outbox</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Every message the system has raised, newest first. In development nothing leaves the
          building, so this is where you check what a client would receive.
        </p>

        {notifications.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title="Nothing queued"
              description="Acknowledgements, quotation reminders, confirmations and delivery notices all appear here as they are raised."
            />
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-3">
            {notifications.map((notification) => {
              // A reset email carries a single-use link. It is shown as masked, never in full.
              const secret = notification.templateKey === 'auth.password-reset'
              return (
                <article key={notification.id} className="rounded border border-line bg-surface p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <div>
                      <p className="text-base text-ink">{notification.subject ?? notification.templateKey}</p>
                      <p className="text-xs text-ink-muted">
                        To {notification.recipient} · {notification.templateKey} ·{' '}
                        {formatSydneyDate(notification.createdAt)}
                      </p>
                    </div>
                    <StatusPill tone={TONE[notification.status] ?? 'neutral'}>
                      {notification.status.charAt(0) + notification.status.slice(1).toLowerCase()}
                    </StatusPill>
                  </div>
                  <p className="mt-3 max-w-prose text-sm whitespace-pre-line text-ink-muted">
                    {secret
                      ? 'This message contains a single-use reset link, so its body is not shown here.'
                      : notification.bodyText}
                  </p>
                  {notification.cancelledReason ? (
                    <p className="mt-2 text-xs text-ink-muted">
                      Cancelled: {notification.cancelledReason}
                    </p>
                  ) : null}
                </article>
              )
            })}
          </div>
        )}
      </main>
    </>
  )
}
