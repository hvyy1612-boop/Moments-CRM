import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { systemClock } from '@/lib/time'
import { AppShell } from '../AppShell'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Calendar — Moments' }

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

type Ev = { id: string; day: number; label: string; projectId: string }

export default async function CalendarPage() {
  const user = await requireRole('/calendar')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const now = systemClock.now()
  const year = now.getFullYear()
  const month = now.getMonth()
  const monthStart = new Date(year, month, 1)
  const monthEnd = new Date(year, month + 1, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const leading = (monthStart.getDay() + 6) % 7

  const bookings = await prisma.booking.findMany({
    where: { startsAt: { gte: monthStart, lt: monthEnd }, status: { not: 'CANCELLED' } },
    orderBy: { startsAt: 'asc' },
    select: {
      id: true,
      startsAt: true,
      project: { select: { id: true, client: { select: { displayName: true } } } },
    },
  })

  const events: Ev[] = bookings.map((b) => ({
    id: b.id,
    day: b.startsAt.getDate(),
    label: b.project.client.displayName,
    projectId: b.project.id,
  }))
  const byDay = new Map<number, Ev[]>()
  for (const e of events) {
    byDay.set(e.day, [...(byDay.get(e.day) ?? []), e])
  }

  const cells: (number | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  return (
    <AppShell user={user} csrf={csrf} active="calendar">
      <h1 className="mb-4 font-serif text-2xl font-semibold text-ink">
        {MONTHS[month]} {year}
      </h1>
      <div className="overflow-hidden rounded-md border border-line">
        <div className="grid grid-cols-7">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="border-b border-r border-line bg-sunk px-3 py-2.5 text-center text-xs font-bold uppercase tracking-wide text-muted last:border-r-0"
            >
              {d}
            </div>
          ))}
          {cells.map((day, i) => (
            <div
              key={i}
              className="min-h-24 border-b border-r border-line bg-surface p-2 text-sm text-muted [&:nth-child(7n)]:border-r-0"
            >
              {day ? (
                <>
                  <span className="tabular">{day}</span>
                  <div className="mt-1 flex flex-col gap-1">
                    {(byDay.get(day) ?? []).map((e) => (
                      <Link
                        key={e.id}
                        href={`/projects/${e.projectId}`}
                        className="truncate rounded bg-accent-tint px-2 py-0.5 text-sm font-medium text-accent-ink"
                      >
                        {e.label}
                      </Link>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  )
}
