import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { EmptyState } from '@/components/ui/EmptyState'
import { StaffHeader } from '@/components/ui/StaffHeader'
import { StatusPill } from '@/components/ui/StatusPill'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { listBookings } from '@/lib/domain/booking'
import { formatAud } from '@/lib/money'
import { daysUntil, formatSydneyDate, systemClock } from '@/lib/time'
import { BOOKING_LABEL, BOOKING_TONE } from './labels'

export const runtime = 'nodejs'

export const metadata: Metadata = { title: 'Bookings — Moments' }

export default async function BookingsPage() {
  const user = await requireRole('/bookings') // SEC-A01
  const bookings = await listBookings()
  const now = systemClock.now()
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  return (
    <>
      <StaffHeader user={user} csrf={csrf} />
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <h1 className="text-xl">Bookings</h1>
        <p className="mt-1 text-sm text-ink-muted">Soonest shoot first.</p>

        {bookings.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title="No bookings yet"
              description="A booking appears here the moment a client accepts a quotation. It holds the date, the crew and everything owed."
            />
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto rounded border border-line bg-surface">
            <table className="w-full min-w-160 border-collapse text-left">
              <caption className="sr-only">Bookings with shoot date, status and value.</caption>
              <thead>
                <tr className="border-b border-line text-xs text-ink-muted">
                  <th scope="col" className="px-4 py-3 font-medium">Client</th>
                  <th scope="col" className="px-4 py-3 font-medium">Shoot date</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Crew</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((booking) => {
                  const days = daysUntil(booking.shootDate, now)
                  const crew = [
                    booking.leadPhotographer?.name,
                    booking.leadVideographer?.name,
                    booking.secondShooter?.name,
                  ].filter(Boolean)
                  return (
                    <tr key={booking.id} className="border-b border-line last:border-b-0">
                      <td className="px-4 py-3">
                        <Link
                          href={`/bookings/${booking.id}`}
                          className="text-base text-ink underline underline-offset-2 transition-colors duration-150 hover:text-accent"
                        >
                          {booking.client.primaryName}
                          {booking.client.partnerName ? ` and ${booking.client.partnerName}` : ''}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-ink">
                        {formatSydneyDate(booking.shootDate)}
                        <span className="block text-xs text-ink-muted">
                          {days >= 0 ? `in ${days} days` : `${Math.abs(days)} days ago`}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill tone={BOOKING_TONE[booking.status] ?? 'neutral'}>
                          {BOOKING_LABEL[booking.status] ?? booking.status}
                        </StatusPill>
                      </td>
                      <td className="px-4 py-3 text-sm text-ink-muted">
                        {crew.length > 0 ? crew.join(', ') : 'Not assigned'}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-ink tabular-nums">
                        {formatAud(booking.quotation.totalGross)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  )
}
