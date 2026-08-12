import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { StatusPill } from '@/components/ui/StatusPill'
import { prisma } from '@/lib/db'
import { fullResolutionUnlocked, outstandingFor } from '@/lib/domain/booking'
import { DELIVERABLE_LABEL } from '@/lib/domain/deliverables'
import { formatAud } from '@/lib/money'
import { daysUntil, formatSydneyDate, systemClock } from '@/lib/time'
import { answersFrom } from '@/lib/validation/questionnaire'
import { Questionnaire } from './Questionnaire'

export const runtime = 'nodejs'

export const metadata: Metadata = {
  title: 'Your booking — Moments Photography and Film',
  robots: { index: false, follow: false },
}

/**
 * The client portal (BR-CP01 to BR-CP07, §20.1).
 *
 * One unguessable link, no account and no password (§8.5). It is the read side of the whole
 * lifecycle: where the booking stands, what is owed, and what has been delivered.
 *
 * BR-CP03: nothing sensitive is selected here. No password hash, no gallery password, no action
 * token, no internal notes, and staff appear only as the studio.
 */
export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const booking = await prisma.booking.findUnique({
    where: { portalToken: token },
    select: {
      id: true,
      status: true,
      shootDate: true,
      venueName: true,
      coverageHours: true,
      dateLockedAt: true,
      cancelledAt: true,
      client: { select: { primaryName: true, partnerName: true } },
      quotation: {
        select: {
          version: true,
          totalGross: true,
          gstAmount: true,
          lines: { orderBy: { displayOrder: 'asc' } },
        },
      },
      agreement: { select: { acceptedName: true, acceptedAt: true, termsText: true } },
      invoices: {
        orderBy: { issueDate: 'asc' },
        select: {
          id: true,
          invoiceNumber: true,
          type: true,
          dueDate: true,
          totalGross: true,
          amountPaid: true,
          status: true,
          payments: {
            orderBy: { receivedDate: 'asc' },
            select: { id: true, amountGross: true, receivedDate: true, method: true },
          },
        },
      },
      deliverables: {
        orderBy: { dueDate: 'asc' },
        select: {
          id: true,
          type: true,
          status: true,
          dueDate: true,
          galleryUrl: true,
          deliveredAt: true,
          galleryExpiresAt: true,
        },
      },
      questionnaire: { select: { status: true, submittedAt: true, responses: true } },
    },
  })
  if (!booking) notFound() // BR-CP05: an unknown token looks like any missing page

  const now = systemClock.now()
  const outstanding = outstandingFor(booking.invoices)
  const unlocked = fullResolutionUnlocked(booking.invoices) // BR-D07
  const couple = booking.client.partnerName
    ? `${booking.client.primaryName} and ${booking.client.partnerName}`
    : booking.client.primaryName

  // BR-CP07: a cancelled booking renders a closed state with nothing to act on.
  const cancelled = booking.status === 'CANCELLED'

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <header>
        <p className="text-sm text-ink-muted">Moments Photography and Film</p>
        <h1 className="mt-1 text-2xl">Your booking</h1>
        <p className="mt-2 text-base text-ink">
          {couple} · {formatSydneyDate(booking.shootDate)}
          {booking.venueName ? ` · ${booking.venueName}` : ''}
        </p>
      </header>

      <section className="mt-8">
        <h2 className="text-lg">Where things stand</h2>
        <div className="mt-3 rounded border border-line bg-surface p-4">
          {cancelled ? (
            <p className="text-base text-ink">This booking has been cancelled.</p>
          ) : booking.status === 'PENDING_BOOKING_FEE' ? (
            <>
              <StatusPill tone="warn">Waiting on the booking fee</StatusPill>
              <p className="mt-2 text-base text-ink">
                Your date is held. It is locked in once the booking fee is paid.
              </p>
            </>
          ) : booking.status === 'CONFIRMED' ? (
            <>
              <StatusPill tone="good">Confirmed</StatusPill>
              <p className="mt-2 text-base text-ink">
                {/* The shoot may already have happened, so the wording follows the calendar. */}
                {daysUntil(booking.shootDate, now) >= 0
                  ? `Your date is locked in, ${daysUntil(booking.shootDate, now)} days away. The studio will be in touch before the day to confirm the schedule.`
                  : 'Your day has been and gone. The studio is working through your photos and film now, and each one appears below as it is ready.'}
              </p>
            </>
          ) : (
            <>
              <StatusPill tone="info">
                {booking.status === 'CLOSED' ? 'Complete' : 'Delivered'}
              </StatusPill>
              <p className="mt-2 text-base text-ink">
                Everything from your day has been handed over. The links are below.
              </p>
            </>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg">What you booked</h2>
        <table className="mt-3 w-full border-collapse text-left">
          <caption className="sr-only">The items on your booking and their prices.</caption>
          <tbody>
            {booking.quotation.lines.map((line) => (
              <tr key={line.id} className="border-b border-line">
                <td className="py-2 text-base text-ink">{line.description}</td>
                <td className="py-2 text-right text-base text-ink tabular-nums">
                  {formatAud(line.lineTotalGross)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="pt-3 text-left text-base font-medium text-ink">Total</th>
              <td className="pt-3 text-right text-base font-medium text-ink tabular-nums">
                {formatAud(booking.quotation.totalGross)}
              </td>
            </tr>
            <tr>
              <th scope="row" className="text-left text-sm font-normal text-ink-muted">Includes GST</th>
              <td className="text-right text-sm text-ink-muted tabular-nums">
                {formatAud(booking.quotation.gstAmount)}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      <section className="mt-8">
        <h2 className="text-lg">Payments</h2>
        {booking.invoices.length === 0 ? (
          <p className="mt-2 text-base text-ink-muted">No invoices yet.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {booking.invoices.map((invoice) => (
              <div key={invoice.id} className="rounded border border-line bg-surface p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <p className="text-base text-ink">
                      {invoice.type === 'BOOKING_FEE'
                        ? 'Booking fee'
                        : invoice.type === 'BALANCE'
                          ? 'Balance'
                          : 'Additional'}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {invoice.invoiceNumber} · due {formatSydneyDate(invoice.dueDate)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-base text-ink tabular-nums">{formatAud(invoice.totalGross)}</p>
                    <p className="text-xs text-ink-muted">
                      {invoice.status === 'PAID'
                        ? 'Paid in full, thank you'
                        : `${formatAud(invoice.totalGross.minus(invoice.amountPaid))} outstanding`}
                    </p>
                  </div>
                </div>
                {invoice.payments.length > 0 ? (
                  <ul className="mt-3 border-t border-line pt-2">
                    {invoice.payments.map((payment) => (
                      <li key={payment.id} className="flex justify-between text-xs text-ink-muted">
                        <span>Received {formatSydneyDate(payment.receivedDate)}</span>
                        <span className="tabular-nums">{formatAud(payment.amountGross)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
            <div className="flex justify-between border-t border-line pt-3">
              <span className="text-base font-medium text-ink">Still to pay</span>
              <span className="text-base font-medium text-ink tabular-nums">
                {formatAud(outstanding)}
              </span>
            </div>
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg">Your photos and film</h2>
        <div className="mt-3 flex flex-col">
          {booking.deliverables.map((deliverable) => (
            <div key={deliverable.id} className="border-b border-line py-3 last:border-b-0">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <p className="text-base text-ink">{DELIVERABLE_LABEL[deliverable.type]}</p>
                  <p className="text-xs text-ink-muted">
                    {deliverable.deliveredAt
                      ? `Delivered ${formatSydneyDate(deliverable.deliveredAt)}`
                      : `Expected by ${formatSydneyDate(deliverable.dueDate)}`}
                    {deliverable.galleryExpiresAt
                      ? ` · available until ${formatSydneyDate(deliverable.galleryExpiresAt)}`
                      : ''}
                  </p>
                </div>
                {deliverable.galleryUrl && deliverable.deliveredAt ? (
                  <a
                    href={deliverable.galleryUrl}
                    className="text-sm text-ink underline underline-offset-2 transition-colors duration-150 hover:text-accent"
                  >
                    Open
                  </a>
                ) : (
                  <span className="text-sm text-ink-muted">Not yet</span>
                )}
              </div>
            </div>
          ))}
        </div>
        {/* BR-D07: full resolution downloads wait until everything is paid. Said plainly. */}
        {!unlocked ? (
          <p className="mt-3 text-sm text-ink-muted">
            Full resolution downloads open once every invoice is paid.
          </p>
        ) : null}
      </section>

      {/* BR-QN01: the questionnaire exists from CONFIRMED, and is the couple's part to fill in. */}
      {booking.questionnaire && !cancelled ? (
        <section className="mt-8">
          <h2 className="text-lg">Planning your day</h2>
          <div className="mt-3">
            <Questionnaire
              token={token}
              answers={answersFrom(booking.questionnaire.responses)}
              submittedAt={
                booking.questionnaire.submittedAt
                  ? formatSydneyDate(booking.questionnaire.submittedAt)
                  : null
              }
              editable={now.getTime() <= booking.shootDate.getTime()}
            />
          </div>
        </section>
      ) : null}

      {booking.agreement ? (
        <section className="mt-8">
          <h2 className="text-lg">What you agreed to</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Accepted by {booking.agreement.acceptedName} on{' '}
            {formatSydneyDate(booking.agreement.acceptedAt)}.
          </p>
          <p className="mt-3 max-w-prose text-sm whitespace-pre-line text-ink">
            {booking.agreement.termsText}
          </p>
        </section>
      ) : null}

      <footer className="mt-12 border-t border-line pt-4">
        <p className="text-xs text-ink-muted">
          Moments Photography and Film · Sydney. Keep this link: it is how you reach this page. If
          anything looks wrong, reply to any email from the studio.
        </p>
      </footer>
    </main>
  )
}
