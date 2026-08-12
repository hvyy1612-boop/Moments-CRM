import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { EmptyState } from '@/components/ui/EmptyState'
import { StaffHeader } from '@/components/ui/StaffHeader'
import { StatusPill } from '@/components/ui/StatusPill'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { listNewEnquiries } from '@/lib/domain/enquiry-workflow'
import { enquirySlaLevel, slaLabel } from '@/lib/domain/enquiry-sla'
import { formatSydneyDate, systemClock } from '@/lib/time'

export const runtime = 'nodejs'

export const metadata: Metadata = { title: 'Dashboard — Moments' }

/**
 * §10.4: the dashboard answers one question first, what needs attention today. Right now that is
 * the enquiry response clock (BR-E07). Quotations about to expire, unpaid invoices and overdue
 * deliverables join it as those slices land.
 *
 * An editor sees the page but not enquiry content (§5), so the section is role gated here as well
 * as by the route permission on /enquiries.
 */
export default async function DashboardPage() {
  const user = await requireRole('/dashboard') // SEC-A01
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''
  const canSeeEnquiries = user.role === 'ADMIN' || user.role === 'STUDIO'

  const now = systemClock.now()
  const newEnquiries = canSeeEnquiries ? await listNewEnquiries() : []
  const waiting = newEnquiries
    .map((enquiry) => ({ enquiry, level: enquirySlaLevel(enquiry, now) }))
    .sort((a, b) => a.enquiry.createdAt.getTime() - b.enquiry.createdAt.getTime())
  const overdue = waiting.filter((row) => row.level !== 'within')

  return (
    <>
      <StaffHeader user={user} csrf={csrf} />
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <h1 className="text-xl">What needs attention today</h1>
        <p className="mt-1 text-sm text-ink-muted">{formatSydneyDate(now)}</p>

        {canSeeEnquiries ? (
          <section className="mt-6 rounded border border-line bg-surface p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-lg">Enquiries waiting for a reply</h2>
              <Link
                href="/enquiries"
                className="text-sm text-ink underline underline-offset-2 transition-colors duration-150 hover:text-accent"
              >
                All enquiries
              </Link>
            </div>
            <p className="mt-1 text-sm text-ink-muted">
              {overdue.length > 0
                ? `${overdue.length} past the 24 hour commitment.`
                : 'All inside the 24 hour commitment.'}
            </p>

            <div className="mt-4">
              {waiting.length === 0 ? (
                <EmptyState
                  title="Nothing waiting"
                  description="Every enquiry has been answered. New submissions from the website will appear here straight away."
                />
              ) : (
                <ul className="flex flex-col">
                  {waiting.map(({ enquiry, level }) => {
                    const sla = slaLabel(level)
                    return (
                      <li
                        key={enquiry.id}
                        className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line py-3 last:border-b-0"
                      >
                        <div>
                          <Link
                            href={`/enquiries/${enquiry.id}`}
                            className="text-base text-ink underline underline-offset-2 transition-colors duration-150 hover:text-accent"
                          >
                            {enquiry.client.primaryName}
                            {enquiry.client.partnerName ? ` and ${enquiry.client.partnerName}` : ''}
                          </Link>
                          <p className="text-xs text-ink-muted">
                            Event {formatSydneyDate(enquiry.eventDate)} · enquired{' '}
                            {formatSydneyDate(enquiry.createdAt)}
                          </p>
                        </div>
                        {sla ? (
                          <StatusPill tone={level === 'escalate' ? 'bad' : 'warn'}>{sla}</StatusPill>
                        ) : (
                          <StatusPill tone="info">Within 24 hours</StatusPill>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </section>
        ) : (
          <section className="mt-6 rounded border border-line bg-surface p-5">
            <h2 className="text-lg">Your deliverables</h2>
            <p className="mt-2 text-sm text-ink-muted">
              Assigned galleries and films will appear here once the delivery screens are built.
            </p>
          </section>
        )}
      </main>
    </>
  )
}
