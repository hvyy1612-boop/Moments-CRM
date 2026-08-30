import { prisma } from '@/lib/db'
import {
  formatSydneyTime,
  sydneyLocalToUtc,
  sydneyYmd,
  systemClock,
} from '@/lib/time'
import { addDays, ENQUIRY_TASK_SCHEDULE } from '@/features/enquiries/workflow'
import { PROJECT_TASK_SCHEDULE } from '@/features/projects/workflow'

/**
 * Calendar aggregation (BR-CAL). The month view is DERIVED - it reads what staff already entered
 * across the app and lays it on the grid, so nothing has to be typed twice:
 *   - Shoots come from Booking (the job's scheduled shoot).
 *   - Appointments come from APPOINTMENT work items on an enquiry (a lead) or a job, using the same
 *     anchored due dates the workflow board shows (enquiry date for leads, shoot date for jobs).
 *   - Standalone entries come from CalendarEvent - things staff add straight onto the calendar
 *     (an extra shoot, a meeting) without opening a case.
 * Placement and month membership are evaluated in the Sydney zone so a late-night event lands on the
 * right day regardless of the server's own time zone.
 */

export type CalCategory = 'lead' | 'job' | 'event'

export type CalEvent = {
  id: string
  day: number
  sortKey: number
  primary: string
  secondary: string | null
  category: CalCategory
  timeLabel: string | null
  href: string | null
  done: boolean
}

export type CalendarFilter = 'all' | 'lead' | 'job' | 'event'

export type CalendarMonth = {
  year: number
  month: number // 1 to 12
  label: string // "August 2026"
  monthKey: string // "2026-08"
  prevKey: string
  nextKey: string
  todayKey: string
  todayDay: number | null // day-of-month if today is in this month, else null
  daysInMonth: number
  leading: number // blank cells before day 1 (Monday-first)
  byDay: Map<number, CalEvent[]>
  total: number
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const APPOINTMENT_HREF = { lead: '/enquiries', job: '/jobs' } as const

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const zero = year * 12 + (month - 1) + delta
  return { year: Math.floor(zero / 12), month: (zero % 12) + 1 }
}

/** A short label for what an appointment is, taken from its task title. */
function appointmentKind(title: string): string {
  return /consult/i.test(title) ? 'Consultation' : /meeting/i.test(title) ? 'Meeting' : 'Appointment'
}

/** A short label for a standalone calendar entry. */
export function calendarEventKindLabel(kind: string): string {
  if (kind === 'SHOOT') return 'Extra shoot'
  if (kind === 'OTHER') return 'Event'
  return 'Appointment'
}

/** Resolve a `?month=YYYY-MM` value (or today) to the month's bounds and neighbours. */
export function resolveMonth(monthKey: string | null | undefined, now: Date) {
  const today = sydneyYmd(now)
  let year = today.year
  let month = today.month
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey ?? '')
  if (match) {
    const y = Number(match[1])
    const m = Number(match[2])
    if (y >= 2000 && y <= 2100 && m >= 1 && m <= 12) {
      year = y
      month = m
    }
  }
  const prev = shiftMonth(year, month, -1)
  const next = shiftMonth(year, month, 1)
  const startUtc = sydneyLocalToUtc(`${year}-${pad(month)}-01T00:00`)
  const endUtc = sydneyLocalToUtc(`${next.year}-${pad(next.month)}-01T00:00`)
  return {
    year,
    month,
    startUtc,
    endUtc,
    label: `${MONTHS[month - 1]} ${year}`,
    monthKey: `${year}-${pad(month)}`,
    prevKey: `${prev.year}-${pad(prev.month)}`,
    nextKey: `${next.year}-${pad(next.month)}`,
    todayKey: `${today.year}-${pad(today.month)}`,
    todayDay: today.year === year && today.month === month ? today.day : null,
  }
}

/** True when `date` falls inside the resolved Sydney month. */
function inMonth(date: Date, startUtc: Date, endUtc: Date): boolean {
  return date.getTime() >= startUtc.getTime() && date.getTime() < endUtc.getTime()
}

export async function getCalendarMonth(
  monthKey: string | null | undefined,
  filter: CalendarFilter = 'all',
): Promise<CalendarMonth> {
  const now = systemClock.now()
  const m = resolveMonth(monthKey, now)
  const want = (c: CalCategory) => filter === 'all' || filter === c

  const events: CalEvent[] = []

  // Shoots - from the job's bookings.
  if (want('job')) {
    const bookings = await prisma.booking.findMany({
      where: { startsAt: { gte: m.startUtc, lt: m.endUtc }, status: { not: 'CANCELLED' } },
      select: {
        id: true,
        title: true,
        startsAt: true,
        project: { select: { id: true, client: { select: { displayName: true } } } },
      },
    })
    for (const b of bookings) {
      events.push({
        id: `b_${b.id}`,
        day: sydneyYmd(b.startsAt).day,
        sortKey: b.startsAt.getTime(),
        primary: b.project.client.displayName,
        secondary: b.title?.trim() || 'Shoot',
        category: 'job',
        timeLabel: formatSydneyTime(b.startsAt),
        href: `/jobs/${b.project.id}`,
        done: false,
      })
    }
  }

  // Appointments - from APPOINTMENT work items on a lead or a job.
  if (want('lead') || want('job')) {
    const appts = await prisma.workItem.findMany({
      where: { type: 'APPOINTMENT', status: { in: ['PENDING', 'COMPLETED'] } },
      select: {
        id: true,
        title: true,
        dueAt: true,
        status: true,
        enquiry: { select: { id: true, name: true, createdAt: true } },
        project: {
          select: {
            id: true,
            client: { select: { displayName: true } },
            bookings: { orderBy: { startsAt: 'desc' }, take: 1, select: { startsAt: true } },
          },
        },
      },
    })
    for (const w of appts) {
      const isLead = Boolean(w.enquiry)
      const category: CalCategory = isLead ? 'lead' : 'job'
      if (!want(category)) continue
      const anchor = isLead ? w.enquiry!.createdAt : (w.project?.bookings[0]?.startsAt ?? null)
      const offset = isLead ? ENQUIRY_TASK_SCHEDULE[w.title] : PROJECT_TASK_SCHEDULE[w.title]
      const date =
        w.dueAt ?? (anchor && offset !== undefined ? addDays(anchor, offset) : null)
      if (!date || !inMonth(date, m.startUtc, m.endUtc)) continue
      const timed = Boolean(w.dueAt)
      events.push({
        id: `w_${w.id}`,
        day: sydneyYmd(date).day,
        sortKey: timed ? date.getTime() : 0,
        primary: isLead ? w.enquiry!.name : (w.project?.client.displayName ?? 'Job'),
        secondary: appointmentKind(w.title),
        category,
        timeLabel: timed ? formatSydneyTime(date) : null,
        href: isLead ? `${APPOINTMENT_HREF.lead}/${w.enquiry!.id}` : `${APPOINTMENT_HREF.job}/${w.project!.id}`,
        done: w.status === 'COMPLETED',
      })
    }
  }

  // Standalone entries staff added straight onto the calendar.
  if (want('event')) {
    const custom = await prisma.calendarEvent.findMany({
      where: { startsAt: { gte: m.startUtc, lt: m.endUtc } },
      select: {
        id: true,
        title: true,
        kind: true,
        startsAt: true,
        allDay: true,
        client: { select: { id: true, displayName: true } },
      },
    })
    for (const e of custom) {
      events.push({
        id: `e_${e.id}`,
        day: sydneyYmd(e.startsAt).day,
        sortKey: e.allDay ? 0 : e.startsAt.getTime(),
        primary: e.title,
        secondary: e.client?.displayName ?? calendarEventKindLabel(e.kind),
        category: 'event',
        timeLabel: e.allDay ? null : formatSydneyTime(e.startsAt),
        href: e.client ? `/clients/${e.client.id}` : null,
        done: false,
      })
    }
  }

  const byDay = new Map<number, CalEvent[]>()
  for (const e of events) {
    byDay.set(e.day, [...(byDay.get(e.day) ?? []), e])
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => a.sortKey - b.sortKey || a.primary.localeCompare(b.primary))
  }

  const monthStartLocal = new Date(m.year, m.month - 1, 1)
  const daysInMonth = new Date(m.year, m.month, 0).getDate()
  const leading = (monthStartLocal.getDay() + 6) % 7 // Monday-first offset

  return {
    year: m.year,
    month: m.month,
    label: m.label,
    monthKey: m.monthKey,
    prevKey: m.prevKey,
    nextKey: m.nextKey,
    todayKey: m.todayKey,
    todayDay: m.todayDay,
    daysInMonth,
    leading,
    byDay,
    total: events.length,
  }
}

export type CreateCalendarEventInput = {
  title: string
  kind: string
  date: string // YYYY-MM-DD (Sydney)
  allDay: boolean
  startTime?: string | null // HH:mm
  endTime?: string | null // HH:mm
  clientId?: string | null
  location?: string | null
  notes?: string | null
  createdByUserId: string
}

/** Create a standalone calendar entry (outside any workflow). Times are Sydney wall-clock. */
export async function createCalendarEvent(input: CreateCalendarEventInput): Promise<void> {
  const company = await prisma.company.findFirst({ select: { id: true } })
  if (!company) throw new Error('No company configured.')

  const timed = !input.allDay && Boolean(input.startTime)
  const startsAt = timed
    ? sydneyLocalToUtc(`${input.date}T${input.startTime}`)
    : sydneyLocalToUtc(`${input.date}T00:00`)
  const endsAt =
    timed && input.endTime ? sydneyLocalToUtc(`${input.date}T${input.endTime}`) : null

  await prisma.calendarEvent.create({
    data: {
      companyId: company.id,
      kind: input.kind,
      title: input.title,
      startsAt,
      endsAt,
      allDay: !timed,
      location: input.location?.trim() || null,
      notes: input.notes?.trim() || null,
      clientId: input.clientId || null,
      createdByUserId: input.createdByUserId,
    },
  })
}
