import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { StaffHeader } from '@/components/ui/StaffHeader'
import { StatusPill } from '@/components/ui/StatusPill'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { getBooking, listCrew, outstandingFor } from '@/lib/domain/booking'
import { answersFrom, QUESTIONS } from '@/lib/validation/questionnaire'
import { AssignCrew } from './AssignCrew'
import { DELIVERABLE_LABEL } from '@/lib/domain/deliverables'
import { env } from '@/lib/env'
import { formatAud } from '@/lib/money'
import { daysUntil, formatSydneyDate, systemClock } from '@/lib/time'
import { BOOKING_LABEL, BOOKING_TONE } from '../labels'
import { DeliverableRow } from './DeliverableRow'
import { RecordPayment } from './RecordPayment'

export const runtime = 'nodejs'

export const metadata: Metadata = { title: 'Booking — Moments' }

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole('/bookings/[id]')
  const { id } = await params

  const booking = await getBooking(id)
  if (!booking) notFound()

  const crew = await listCrew()

  const now = systemClock.now()
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''
  const outstanding = outstandingFor(booking.invoices)
  const portalLink = booking.portalToken
    ? `${env.NEXT_PUBLIC_APP_URL}/portal/${booking.portalToken}`
    : null

  return (
    <>
      <StaffHeader user={user} csrf={csrf} />
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <Link
          href="/bookings"
          className="text-sm text-ink underline underline-offset-2 transition-colors duration-150 hover:text-accent"
        >
          Back to bookings
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl">
              {booking.client.primaryName}
              {booking.client.partnerName ? ` and ${booking.client.partnerName}` : ''}
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              {formatSydneyDate(booking.shootDate)} ·{' '}
              {daysUntil(booking.shootDate, now) >= 0
                ? `in ${daysUntil(booking.shootDate, now)} days`
                : `${Math.abs(daysUntil(booking.shootDate, now))} days ago`}
              {booking.venueName ? ` · ${booking.venueName}` : ''}
            </p>
          </div>
          <div className="text-right">
            <StatusPill tone={BOOKING_TONE[booking.status] ?? 'neutral'}>
              {BOOKING_LABEL[booking.status] ?? booking.status}
            </StatusPill>
            {booking.dateLockedAt ? (
              <p className="mt-1 text-xs text-ink-muted">
                Date locked {formatSydneyDate(booking.dateLockedAt)}
              </p>
            ) : (
              <p className="mt-1 text-xs text-warn">Date held provisionally</p>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-3">
          <div className="flex flex-col gap-6 md:col-span-2">
            <section className="rounded border border-line bg-surface p-5">
              <h2 className="text-lg">Money</h2>
              <table className="mt-3 w-full border-collapse text-left">
                <caption className="sr-only">Invoices on this booking with amounts and status.</caption>
                <thead>
                  <tr className="border-b border-line text-xs text-ink-muted">
                    <th scope="col" className="py-2 font-medium">Invoice</th>
                    <th scope="col" className="py-2 font-medium">Due</th>
                    <th scope="col" className="py-2 text-right font-medium">Total</th>
                    <th scope="col" className="py-2 text-right font-medium">Paid</th>
                    <th scope="col" className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {booking.invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b border-line last:border-b-0">
                      <td className="py-2 text-sm text-ink">
                        <Link
                          href={`/invoices/${invoice.id}`}
                          className="underline underline-offset-2 transition-colors duration-150 hover:text-accent"
                        >
                          {invoice.invoiceNumber}
                        </Link>
                        <span className="block text-xs text-ink-muted">
                          {invoice.type === 'BOOKING_FEE' ? 'Booking fee' : invoice.type === 'BALANCE' ? 'Balance' : 'Additional'}
                        </span>
                      </td>
                      <td className="py-2 text-sm text-ink">{formatSydneyDate(invoice.dueDate)}</td>
                      <td className="py-2 text-right text-sm text-ink tabular-nums">
                        {formatAud(invoice.totalGross)}
                      </td>
                      <td className="py-2 text-right text-sm text-ink tabular-nums">
                        {formatAud(invoice.amountPaid)}
                      </td>
                      <td className="py-2 text-sm text-ink">
                        {invoice.status.charAt(0) + invoice.status.slice(1).toLowerCase().replace('_', ' ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 flex justify-between border-t border-line pt-3">
                <span className="text-base font-medium text-ink">Still owing</span>
                <span className="text-base font-medium text-ink tabular-nums">
                  {formatAud(outstanding)}
                </span>
              </div>
            </section>

            <section className="rounded border border-line bg-surface p-5">
              <h2 className="text-lg">Deliverables</h2>
              <p className="mt-1 text-sm text-ink-muted">
                Each one has its own due date and status, so photos and video never hide behind one
                another.
              </p>
              <div className="mt-4 flex flex-col">
                {booking.deliverables.map((deliverable) => (
                  <DeliverableRow
                    key={deliverable.id}
                    id={deliverable.id}
                    label={DELIVERABLE_LABEL[deliverable.type]}
                    status={deliverable.status}
                    dueDate={formatSydneyDate(deliverable.dueDate)}
                    overdue={
                      deliverable.status !== 'DELIVERED' &&
                      deliverable.status !== 'CLOSED' &&
                      deliverable.dueDate.getTime() < now.getTime()
                    }
                    galleryUrl={deliverable.galleryUrl}
                    csrf={csrf}
                  />
                ))}
              </div>
            </section>
          </div>

          <div className="flex flex-col gap-6">
            <section className="rounded border border-line bg-surface p-5">
              <h2 className="text-lg">Record a payment</h2>
              <div className="mt-3">
                <RecordPayment
                  invoices={booking.invoices
                    .filter((invoice) => invoice.status !== 'PAID' && invoice.status !== 'VOID')
                    .map((invoice) => ({
                      id: invoice.id,
                      label: `${invoice.invoiceNumber} · ${formatAud(invoice.totalGross.minus(invoice.amountPaid))} owing`,
                      outstanding: invoice.totalGross.minus(invoice.amountPaid).toFixed(2),
                    }))}
                  csrf={csrf}
                />
              </div>
            </section>

            <section className="rounded border border-line bg-surface p-5">
              <h2 className="text-lg">Crew</h2>
              <div className="mt-3">
                <AssignCrew
                  bookingId={booking.id}
                  crew={crew}
                  current={{
                    leadPhotographerId: booking.leadPhotographer?.id ?? null,
                    leadVideographerId: booking.leadVideographer?.id ?? null,
                    secondShooterId: booking.secondShooter?.id ?? null,
                  }}
                  csrf={csrf}
                />
              </div>
            </section>

            {booking.questionnaire ? (
              <section className="rounded border border-line bg-surface p-5">
                <h2 className="text-lg">Planning answers</h2>
                {booking.questionnaire.status === 'SUBMITTED' ? (
                  <>
                    <p className="mt-1 text-xs text-ink-muted">
                      Sent{' '}
                      {booking.questionnaire.submittedAt
                        ? formatSydneyDate(booking.questionnaire.submittedAt)
                        : 'recently'}
                      .
                    </p>
                    <dl className="mt-3 flex flex-col gap-3">
                      {QUESTIONS.filter(
                        (question) => answersFrom(booking.questionnaire?.responses)[question.key],
                      ).map((question) => (
                        <div key={question.key}>
                          <dt className="text-xs text-ink-muted">{question.label}</dt>
                          <dd className="text-sm whitespace-pre-line text-ink">
                            {answersFrom(booking.questionnaire?.responses)[question.key]}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-ink-muted">
                    Not filled in yet. The couple are reminded 60 days before the shoot.
                  </p>
                )}
              </section>
            ) : null}

            {booking.agreement ? (
              <section className="rounded border border-line bg-surface p-5">
                <h2 className="text-lg">Agreement</h2>
                <dl className="mt-3 flex flex-col gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-ink-muted">Accepted by</dt>
                    <dd className="text-ink">{booking.agreement.acceptedName}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-muted">On</dt>
                    <dd className="text-ink">{formatSydneyDate(booking.agreement.acceptedAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-muted">Quotation version</dt>
                    <dd className="text-ink">
                      {booking.agreement.quotationVersion} · {formatAud(booking.agreement.totalGross)}
                    </dd>
                  </div>
                </dl>
              </section>
            ) : null}

            {portalLink ? (
              <section className="rounded border border-line bg-surface p-5">
                <h2 className="text-lg">Client portal</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  The couple follow their job here. No account, no password.
                </p>
                <p className="mt-2 break-all rounded border border-line bg-paper px-3 py-2 text-xs text-ink">
                  {portalLink}
                </p>
              </section>
            ) : null}
          </div>
        </div>
      </main>
    </>
  )
}
