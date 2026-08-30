import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { can } from '@/lib/auth/authz'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { getCalendarMonth, type CalCategory, type CalendarFilter, type CalEvent } from '@/lib/domain/calendar'
import { AppShell } from '../AppShell'
import { AddEventDialog } from './AddEventDialog'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Calendar - Moments' }

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const FILTERS: { key: CalendarFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'lead', label: 'Leads' },
  { key: 'job', label: 'Jobs' },
  { key: 'event', label: 'Events' },
]

// Colour by category (design tokens): leads = amber, jobs = rose, studio events = plum.
const CHIP: Record<CalCategory, string> = {
  lead: 'bg-enquiry text-enquiry-ink',
  job: 'bg-accent-tint text-accent-ink',
  event: 'bg-booked text-booked-ink',
}

const LEGEND: { category: CalCategory; label: string }[] = [
  { category: 'lead', label: 'Lead appointments' },
  { category: 'job', label: 'Shoots and job appointments' },
  { category: 'event', label: 'Studio events' },
]

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function EventChip({ e }: { e: CalEvent }) {
  const done = e.done ? 'line-through opacity-70' : ''
  const inner = (
    <>
      <span className={`block truncate text-xs font-medium ${done}`}>{e.primary}</span>
      <span className="block truncate text-xs opacity-80">
        {e.timeLabel ? `${e.timeLabel} - ` : ''}
        {e.secondary}
      </span>
    </>
  )
  const cls = `block rounded px-1.5 py-1 leading-tight ${CHIP[e.category]}`
  return e.href ? (
    <Link href={e.href} className={`${cls} hover:brightness-95`}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  )
}

function NavLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="flex h-8 items-center justify-center rounded border border-line bg-surface px-2 text-ink-muted hover:bg-paper hover:text-ink"
    >
      {children}
    </Link>
  )
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; filter?: string }>
}) {
  const user = await requireRole('/calendar')
  const sp = await searchParams
  const filter: CalendarFilter = (['all', 'lead', 'job', 'event'] as const).includes(
    sp.filter as CalendarFilter,
  )
    ? (sp.filter as CalendarFilter)
    : 'all'

  const cal = await getCalendarMonth(sp.month, filter)

  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''
  const canManage = can(user, 'CALENDAR_MANAGE')
  const clients = canManage
    ? await prisma.client.findMany({
        where: { archivedAt: null },
        orderBy: { displayName: 'asc' },
        select: { id: true, displayName: true },
        take: 500,
      })
    : []
  const defaultDate = `${cal.year}-${pad(cal.month)}-${pad(cal.todayDay ?? 1)}`

  const cells: (number | null)[] = [
    ...Array.from({ length: cal.leading }, () => null),
    ...Array.from({ length: cal.daysInMonth }, (_, i) => i + 1),
  ]

  const withFilter = (monthKey: string) =>
    `/calendar?month=${monthKey}${filter === 'all' ? '' : `&filter=${filter}`}`
  const withMonth = (f: CalendarFilter) =>
    `/calendar?month=${cal.monthKey}${f === 'all' ? '' : `&filter=${f}`}`

  return (
    <AppShell
      user={user}
      csrf={csrf}
      active="calendar"
      action={canManage ? <AddEventDialog csrf={csrf} clients={clients} defaultDate={defaultDate} /> : undefined}
    >
      {/* Toolbar: month + navigation on the left, filter on the right. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="font-serif text-2xl font-semibold text-ink">{cal.label}</h1>
          <div className="ml-1 flex items-center gap-1">
            <NavLink href={withFilter(cal.prevKey)} label="Previous month">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </NavLink>
            <NavLink href={withFilter(cal.nextKey)} label="Next month">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </NavLink>
            <Link
              href={withFilter(cal.todayKey)}
              className="flex h-8 items-center rounded border border-line bg-surface px-3 text-sm text-ink-muted hover:bg-paper hover:text-ink"
            >
              Today
            </Link>
          </div>
        </div>

        <div className="flex items-center rounded border border-line bg-surface p-0.5">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={withMonth(f.key)}
              aria-current={filter === f.key ? 'true' : undefined}
              className={`rounded px-3 py-1 text-sm transition-colors ${
                filter === f.key ? 'bg-sunk font-medium text-ink' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </div>

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
          {cells.map((day, i) => {
            const isToday = day !== null && day === cal.todayDay
            const dayEvents = day !== null ? (cal.byDay.get(day) ?? []) : []
            return (
              <div
                key={i}
                className={`min-h-28 border-b border-r border-line p-2 text-sm [&:nth-child(7n)]:border-r-0 ${
                  day === null ? 'bg-paper' : 'bg-surface'
                }`}
              >
                {day !== null ? (
                  <>
                    <span
                      className={`tabular inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-sm ${
                        isToday ? 'bg-accent font-semibold text-paper' : 'text-ink-muted'
                      }`}
                    >
                      {day}
                    </span>
                    <div className="mt-1 flex flex-col gap-1">
                      {dayEvents.map((e) => (
                        <EventChip key={e.id} e={e} />
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend + empty state. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-muted">
        {LEGEND.map((l) => (
          <span key={l.category} className="flex items-center gap-1.5">
            <span className={`inline-block h-3 w-3 rounded-sm ${CHIP[l.category]}`} />
            {l.label}
          </span>
        ))}
      </div>
      {cal.total === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-line bg-surface px-4 py-6 text-center text-sm text-ink-muted">
          Nothing scheduled in {cal.label}. Shoots, appointments and due dates appear here as soon as
          staff enter them{canManage ? ', or use Add event to schedule something now' : ''}.
        </p>
      ) : null}
    </AppShell>
  )
}
