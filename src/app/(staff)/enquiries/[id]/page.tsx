import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { StaffHeader } from '@/components/ui/StaffHeader'
import { StatusPill } from '@/components/ui/StatusPill'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import {
  getEnquiry,
  getEnquiryTimeline,
  listAssignableUsers,
  logClientRecordView,
} from '@/lib/domain/enquiry-workflow'
import { enquirySlaLevel, slaLabel } from '@/lib/domain/enquiry-sla'
import { requestMeta } from '@/lib/http'
import { daysUntil, formatSydneyDate, systemClock } from '@/lib/time'
import { ENQUIRY_TYPE_LABEL, STATUS_TONE } from '../labels'
import { EnquiryActions } from './EnquiryActions'
import { Timeline } from './Timeline'

export const runtime = 'nodejs'

export const metadata: Metadata = { title: 'Enquiry — Moments' }

export default async function EnquiryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole('/enquiries/[id]')
  const { id } = await params

  const enquiry = await getEnquiry(id)
  if (!enquiry) notFound()

  const meta = await requestMeta()
  await logClientRecordView(
    { enquiryId: enquiry.id, clientId: enquiry.client.id, userId: user.id },
    meta,
  )

  const [timeline, assignable] = await Promise.all([getEnquiryTimeline(enquiry.id), listAssignableUsers()])
  const now = systemClock.now()
  const sla = slaLabel(enquirySlaLevel(enquiry, now))
  const days = daysUntil(enquiry.eventDate, now)
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  return (
    <>
      <StaffHeader user={user} csrf={csrf} />
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <Link
          href="/enquiries"
          className="text-sm text-ink underline underline-offset-2 transition-colors duration-150 hover:text-accent"
        >
          Back to enquiries
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl">
              {enquiry.client.primaryName}
              {enquiry.client.partnerName ? ` and ${enquiry.client.partnerName}` : ''}
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              {ENQUIRY_TYPE_LABEL[enquiry.enquiryType]} · enquired {formatSydneyDate(enquiry.createdAt)}
            </p>
          </div>
          <div className="text-right">
            <StatusPill tone={STATUS_TONE[enquiry.status]}>
              {enquiry.status.charAt(0) + enquiry.status.slice(1).toLowerCase()}
            </StatusPill>
            {sla ? <p className="mt-1 text-xs text-warn">{sla}</p> : null}
          </div>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-3">
          <div className="flex flex-col gap-6 md:col-span-2">
            <section className="rounded border border-line bg-surface p-5">
              <h2 className="text-lg">The enquiry</h2>
              <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <Detail term="Event date">
                  {formatSydneyDate(enquiry.eventDate)}
                  <span className="block text-xs text-ink-muted">
                    {days >= 0 ? `in ${days} days` : `${Math.abs(days)} days ago`}
                  </span>
                </Detail>
                <Detail term="Venue">
                  {enquiry.venueName ?? 'Not said yet'}
                  {enquiry.venueSuburb ? (
                    <span className="block text-xs text-ink-muted">{enquiry.venueSuburb}</span>
                  ) : null}
                </Detail>
                <Detail term="Guests">{enquiry.guestCount ?? 'Not said yet'}</Detail>
                <Detail term="Packages of interest">
                  {enquiry.packages.length > 0
                    ? enquiry.packages.map((row) => row.package.name).join(', ')
                    : 'None selected'}
                </Detail>
                {enquiry.status === 'LOST' && enquiry.lostReason ? (
                  <Detail term="Reason lost">{enquiry.lostReason}</Detail>
                ) : null}
              </dl>
              {enquiry.message ? (
                <div className="mt-4 border-t border-line pt-4">
                  <h3 className="text-sm font-medium text-ink">What they told the studio</h3>
                  <p className="mt-1 max-w-prose text-base whitespace-pre-line text-ink">
                    {enquiry.message}
                  </p>
                </div>
              ) : null}
            </section>

            <section className="rounded border border-line bg-surface p-5">
              <h2 className="text-lg">Timeline</h2>
              <p className="mt-1 text-sm text-ink-muted">
                Everything that has happened on this enquiry, most recent first.
              </p>
              <div className="mt-4">
                <Timeline entries={timeline} />
              </div>
            </section>
          </div>

          <div className="flex flex-col gap-6">
            <section className="rounded border border-line bg-surface p-5">
              <h2 className="text-lg">Client</h2>
              <dl className="mt-3 flex flex-col gap-3">
                <Detail term="Email">{enquiry.client.email}</Detail>
                <Detail term="Mobile">{enquiry.client.phone ?? 'Not given'}</Detail>
                <Detail term="Suburb">{enquiry.client.suburb ?? 'Not given'}</Detail>
              </dl>
              {/* PRIV-02: every client screen shows the consent state plainly. */}
              <p className="mt-4 border-t border-line pt-3 text-xs text-ink-muted">
                {enquiry.client.marketingConsent
                  ? 'Marketing consent given. Studio updates may be sent.'
                  : 'No marketing consent. Send job related messages only.'}
              </p>
            </section>

            <section className="rounded border border-line bg-surface p-5">
              <h2 className="text-lg">Quotations</h2>
              {enquiry.quotations.length === 0 ? (
                <p className="mt-2 text-sm text-ink-muted">None yet.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {enquiry.quotations.map((quotation) => (
                    <li key={quotation.id} className="flex items-baseline justify-between gap-3">
                      <Link
                        href={`/quotations/${quotation.id}`}
                        className="text-sm text-ink underline underline-offset-2 transition-colors duration-150 hover:text-accent"
                      >
                        Version {quotation.version}
                      </Link>
                      <span className="text-xs text-ink-muted">
                        {quotation.status.charAt(0) + quotation.status.slice(1).toLowerCase()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {enquiry.status !== 'WON' && enquiry.status !== 'LOST' ? (
                <Link
                  href={`/enquiries/${enquiry.id}/quote`}
                  className="mt-3 inline-flex h-10 w-full items-center justify-center rounded bg-accent px-4 text-base font-medium text-surface transition-colors duration-150 hover:brightness-95"
                >
                  {enquiry.quotations.length === 0 ? 'Build a quotation' : 'Build a new version'}
                </Link>
              ) : null}
            </section>

            <section className="rounded border border-line bg-surface p-5">
              <h2 className="text-lg">Actions</h2>
              <div className="mt-3">
                <EnquiryActions
                  enquiryId={enquiry.id}
                  status={enquiry.status}
                  lostReason={enquiry.lostReason}
                  assignedUserId={enquiry.assignedUser?.id ?? null}
                  assignable={assignable}
                  csrf={csrf}
                />
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  )
}

function Detail({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{term}</dt>
      <dd className="text-base text-ink">{children}</dd>
    </div>
  )
}
