import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { formatSydneyTime, sydneyLocalToUtc, sydneyYmd, systemClock } from '@/lib/time'
import { addDays, ENQUIRY_TASK_SCHEDULE } from '@/features/enquiries/workflow'
import { PROJECT_TASK_SCHEDULE } from '@/features/projects/workflow'

/**
 * Calendar aggregation (BR-CAL). The calendar is DERIVED - it lays what staff already entered onto a
 * Month or Week grid so nothing is typed twice:
 *   - Shoots come from Booking; workflow appointments from APPOINTMENT work items (lead or job),
 *     using the same anchored due dates as the board; standalone entries from CalendarEvent.
 * Every position (which day, which hour) is computed in the Sydney zone so a late event lands on the
 * right day/slot regardless of the server's own time zone. Overlapping shoots are flagged as a
 * conflict so a double-booking is caught immediately.
 */

export type CalCategory = 'lead' | 'job' | 'event'
export type CalendarFilter = 'all' | 'lead' | 'job' | 'event'
export type CalendarView = 'month' | 'week'

export type CalItem = {
  id: string // stable dom id, e.g. b_<id>
  kind: 'booking' | 'event' | 'appointment' | 'task'
  refId: string // underlying row id, for move actions
  dayKey: string // YYYY-MM-DD in Sydney (which cell/column)
  startMin: number | null // minutes from Sydney midnight; null = all-day / undated
  endMin: number | null
  primary: string
  secondary: string | null
  category: CalCategory
  tone: 'overdue' | 'today' | 'soon' | null
  timeLabel: string | null
  href: string | null
  editable: boolean // draggable (bookings + standalone events)
  location: string | null
  status: string | null // booking status (tentative/confirmed)
  conflict: boolean
  done: boolean
}

export type CalendarViewData = {
  view: CalendarView
  anchorKey: string // YYYY-MM-DD
  label: string
  prevKey: string
  nextKey: string
  todayKey: string
  todayDateKey: string
  items: CalItem[]
  conflictCount: number
  // month layout
  month: { year: number; monthNum: number; daysInMonth: number; leading: number; todayDay: number | null } | null
  // week layout
  week: { days: { dateKey: string; dow: string; dayNum: number; isToday: boolean }[]; startHour: number; endHour: number } | null
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DOW = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

function pad(n: number): string { return String(n).padStart(2, '0') }
function dateKeyOf(y: number, m: number, d: number): string { return `${y}-${pad(m)}-${pad(d)}` }

function sydneyDateKey(date: Date): string {
  const p = sydneyYmd(date)
  return dateKeyOf(p.year, p.month, p.day)
}

/** Minutes from Sydney midnight for an instant (0..1439). */
function sydneyMinutes(date: Date): number {
  const at: Record<string, string> = {}
  for (const part of new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Australia/Sydney', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)) {
    if (part.type !== 'literal') at[part.type] = part.value
  }
  return Number(at.hour) * 60 + Number(at.minute)
}

function shiftMonth(y: number, m: number, delta: number) {
  const zero = y * 12 + (m - 1) + delta
  return { y: Math.floor(zero / 12), m: (zero % 12) + 1 }
}

function appointmentKind(title: string): string {
  return /consult/i.test(title) ? 'Consultation' : /meeting/i.test(title) ? 'Meeting' : /call/i.test(title) ? 'Call' : 'Appointment'
}

export function calendarEventKindLabel(kind: string): string {
  if (kind === 'SHOOT') return 'Extra shoot'
  if (kind === 'OTHER') return 'Event'
  return 'Appointment'
}

/** Parse a `?date=YYYY-MM-DD` anchor, else today (Sydney). */
function resolveAnchor(dateKey: string | null | undefined, now: Date): { y: number; m: number; d: number } {
  const t = sydneyYmd(now)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey ?? '')
  if (match) {
    const y = Number(match[1]), m = Number(match[2]), d = Number(match[3])
    if (y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) return { y, m, d }
  }
  return { y: t.year, m: t.month, d: t.day }
}

function tone(dueMs: number | null, done: boolean, nowMs: number): CalItem['tone'] {
  if (done || dueMs === null) return null
  const diff = Math.floor((dueMs - nowMs) / 86_400_000)
  if (diff < 0) return 'overdue'
  if (diff === 0) return 'today'
  if (diff <= 3) return 'soon'
  return null
}

/** Fetch every calendar item whose Sydney day falls in [startUtc, endUtc), flag shoot conflicts. */
async function fetchItems(startUtc: Date, endUtc: Date, filter: CalendarFilter, now: Date): Promise<CalItem[]> {
  const nowMs = now.getTime()
  const want = (c: CalCategory) => filter === 'all' || filter === c
  const items: CalItem[] = []

  // Shoots (bookings) - category job.
  if (want('job')) {
    const bookings = await prisma.booking.findMany({
      where: { startsAt: { gte: startUtc, lt: endUtc }, status: { not: 'CANCELLED' } },
      select: { id: true, title: true, startsAt: true, endsAt: true, status: true, location: true,
        project: { select: { id: true, client: { select: { displayName: true } } } } },
    })
    for (const b of bookings) {
      items.push({
        id: `b_${b.id}`, kind: 'booking', refId: b.id, dayKey: sydneyDateKey(b.startsAt),
        startMin: sydneyMinutes(b.startsAt), endMin: b.endsAt ? sydneyMinutes(b.endsAt) : null,
        primary: b.project.client.displayName, secondary: b.title?.trim() || 'Shoot',
        category: 'job', tone: null, timeLabel: formatSydneyTime(b.startsAt),
        href: `/jobs/${b.project.id}`, editable: true, location: b.location ?? null,
        status: b.status, conflict: false, done: false,
      })
    }
  }

  // Appointments (APPOINTMENT work items) - lead or job.
  if (want('lead') || want('job')) {
    const appts = await prisma.workItem.findMany({
      where: { type: 'APPOINTMENT', status: { in: ['PENDING', 'COMPLETED'] } },
      select: { id: true, title: true, dueAt: true, status: true,
        enquiry: { select: { id: true, name: true, createdAt: true } },
        project: { select: { id: true, client: { select: { displayName: true } },
          bookings: { orderBy: { startsAt: 'desc' }, take: 1, select: { startsAt: true } } } } },
    })
    for (const w of appts) {
      const isLead = Boolean(w.enquiry)
      const category: CalCategory = isLead ? 'lead' : 'job'
      if (!want(category)) continue
      const anchor = isLead ? w.enquiry!.createdAt : (w.project?.bookings[0]?.startsAt ?? null)
      const offset = isLead ? ENQUIRY_TASK_SCHEDULE[w.title] : PROJECT_TASK_SCHEDULE[w.title]
      const date = w.dueAt ?? (anchor && offset !== undefined ? addDays(anchor, offset) : null)
      if (!date || date.getTime() < startUtc.getTime() || date.getTime() >= endUtc.getTime()) continue
      const timed = Boolean(w.dueAt)
      const done = w.status === 'COMPLETED'
      items.push({
        id: `w_${w.id}`, kind: 'appointment', refId: w.id, dayKey: sydneyDateKey(date),
        startMin: timed ? sydneyMinutes(date) : null, endMin: null,
        primary: isLead ? w.enquiry!.name : (w.project?.client.displayName ?? 'Job'),
        secondary: appointmentKind(w.title), category, tone: tone(date.getTime(), done, nowMs),
        timeLabel: timed ? formatSydneyTime(date) : null,
        href: isLead ? `/enquiries/${w.enquiry!.id}` : `/jobs/${w.project!.id}`,
        editable: false, location: null, status: null, conflict: false, done,
      })
    }
  }

  // Upcoming workflow tasks (to-dos with a due date) as all-day markers - HoneyBook / Google-Tasks
  // style: informational, do not block a time slot; overdue is toned red. APPOINTMENT (shown above)
  // and AUTO (system rows) are excluded. Job tasks only appear once the job has a shoot date to
  // anchor to, which is why an un-booked job stays quiet.
  if (want('lead') || want('job')) {
    const tasks = await prisma.workItem.findMany({
      where: { type: { notIn: ['APPOINTMENT', 'AUTO'] }, status: 'PENDING' },
      select: { id: true, title: true, dueAt: true,
        enquiry: { select: { id: true, name: true, createdAt: true } },
        project: { select: { id: true, client: { select: { displayName: true } }, bookings: { orderBy: { startsAt: 'desc' }, take: 1, select: { startsAt: true } } } } },
    })
    for (const w of tasks) {
      const isLead = Boolean(w.enquiry)
      const category: CalCategory = isLead ? 'lead' : 'job'
      if (!want(category)) continue
      const anchor = isLead ? w.enquiry!.createdAt : (w.project?.bookings[0]?.startsAt ?? null)
      const offset = isLead ? ENQUIRY_TASK_SCHEDULE[w.title] : PROJECT_TASK_SCHEDULE[w.title]
      const date = w.dueAt ?? (anchor && offset !== undefined ? addDays(anchor, offset) : null)
      if (!date || date.getTime() < startUtc.getTime() || date.getTime() >= endUtc.getTime()) continue
      items.push({
        id: `t_${w.id}`, kind: 'task', refId: w.id, dayKey: sydneyDateKey(date),
        startMin: null, endMin: null,
        primary: w.title, secondary: isLead ? w.enquiry!.name : (w.project?.client.displayName ?? 'Job'),
        category, tone: tone(date.getTime(), false, nowMs), timeLabel: null,
        href: isLead ? `/enquiries/${w.enquiry!.id}` : `/jobs/${w.project!.id}`,
        editable: false, location: null, status: null, conflict: false, done: false,
      })
    }
  }

  // Standalone entries.
  if (want('event')) {
    const custom = await prisma.calendarEvent.findMany({
      where: { startsAt: { gte: startUtc, lt: endUtc } },
      select: { id: true, title: true, kind: true, startsAt: true, endsAt: true, allDay: true, location: true,
        client: { select: { id: true, displayName: true } } },
    })
    for (const e of custom) {
      items.push({
        id: `e_${e.id}`, kind: 'event', refId: e.id, dayKey: sydneyDateKey(e.startsAt),
        startMin: e.allDay ? null : sydneyMinutes(e.startsAt), endMin: e.allDay || !e.endsAt ? null : sydneyMinutes(e.endsAt),
        primary: e.title, secondary: e.client?.displayName ?? calendarEventKindLabel(e.kind),
        category: 'event', tone: null, timeLabel: e.allDay ? null : formatSydneyTime(e.startsAt),
        href: e.client ? `/clients/${e.client.id}` : null, editable: true,
        location: e.location ?? null, status: null, conflict: false, done: false,
      })
    }
  }

  flagConflicts(items)
  return items
}

/** Two shoots on the same day whose [start,end) overlap are a double-booking. */
function flagConflicts(items: CalItem[]): void {
  const shoots = items.filter((i) => i.kind === 'booking' && i.startMin !== null)
  for (let a = 0; a < shoots.length; a++) {
    for (let b = a + 1; b < shoots.length; b++) {
      const x = shoots[a], y = shoots[b]
      if (!x || !y || x.dayKey !== y.dayKey || x.startMin === null || y.startMin === null) continue
      const xEnd = x.endMin ?? x.startMin + 60
      const yEnd = y.endMin ?? y.startMin + 60
      if (x.startMin < yEnd && y.startMin < xEnd) { x.conflict = true; y.conflict = true }
    }
  }
}

export async function getCalendarView(
  view: CalendarView,
  dateKey: string | null | undefined,
  filter: CalendarFilter,
): Promise<CalendarViewData> {
  const now = systemClock.now()
  const anchor = resolveAnchor(dateKey, now)
  const today = sydneyYmd(now)
  const todayKey = dateKeyOf(today.year, today.month, today.day)

  let startUtc: Date, endUtc: Date, label: string, prevKey: string, nextKey: string, anchorKey: string
  let month: CalendarViewData['month'] = null
  let week: CalendarViewData['week'] = null

  if (view === 'week') {
    // Monday-first week containing the anchor.
    const anchorLocal = new Date(anchor.y, anchor.m - 1, anchor.d)
    const offset = (anchorLocal.getDay() + 6) % 7
    const monday = new Date(anchor.y, anchor.m - 1, anchor.d - offset)
    const sunday = new Date(anchor.y, anchor.m - 1, anchor.d - offset + 6)
    const mk = { y: monday.getFullYear(), m: monday.getMonth() + 1, d: monday.getDate() }
    const nextMon = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7)
    const prevMon = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7)
    startUtc = sydneyLocalToUtc(`${dateKeyOf(mk.y, mk.m, mk.d)}T00:00`)
    endUtc = sydneyLocalToUtc(`${dateKeyOf(nextMon.getFullYear(), nextMon.getMonth() + 1, nextMon.getDate())}T00:00`)
    anchorKey = dateKeyOf(mk.y, mk.m, mk.d)
    prevKey = dateKeyOf(prevMon.getFullYear(), prevMon.getMonth() + 1, prevMon.getDate())
    nextKey = dateKeyOf(nextMon.getFullYear(), nextMon.getMonth() + 1, nextMon.getDate())
    const days = Array.from({ length: 7 }, (_, i) => {
      const dd = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)
      const dk = dateKeyOf(dd.getFullYear(), dd.getMonth() + 1, dd.getDate())
      return { dateKey: dk, dow: DOW[i] ?? '', dayNum: dd.getDate(), isToday: dk === todayKey }
    })
    const sameMonth = mk.m === sunday.getMonth() + 1
    label = sameMonth
      ? `${mk.d} - ${sunday.getDate()} ${MONTHS[mk.m - 1]} ${mk.y}`
      : `${mk.d} ${MONTHS[mk.m - 1]} - ${sunday.getDate()} ${MONTHS[sunday.getMonth()]} ${sunday.getFullYear()}`
    week = { days, startHour: 7, endHour: 21 }
  } else {
    const start = new Date(anchor.y, anchor.m - 1, 1)
    const prev = shiftMonth(anchor.y, anchor.m, -1)
    const next = shiftMonth(anchor.y, anchor.m, 1)
    startUtc = sydneyLocalToUtc(`${dateKeyOf(anchor.y, anchor.m, 1)}T00:00`)
    endUtc = sydneyLocalToUtc(`${dateKeyOf(next.y, next.m, 1)}T00:00`)
    anchorKey = dateKeyOf(anchor.y, anchor.m, 1)
    prevKey = dateKeyOf(prev.y, prev.m, 1)
    nextKey = dateKeyOf(next.y, next.m, 1)
    label = `${MONTHS[anchor.m - 1]} ${anchor.y}`
    const daysInMonth = new Date(anchor.y, anchor.m, 0).getDate()
    const leading = (start.getDay() + 6) % 7
    const todayDay = today.year === anchor.y && today.month === anchor.m ? today.day : null
    month = { year: anchor.y, monthNum: anchor.m, daysInMonth, leading, todayDay }
  }

  const items = await fetchItems(startUtc, endUtc, filter, now)
  const conflictCount = new Set(items.filter((i) => i.conflict).map((i) => i.id)).size

  return { view, anchorKey, label, prevKey, nextKey, todayKey, todayDateKey: todayKey, items, conflictCount, month, week }
}

export type CreateCalendarEventInput = {
  title: string; kind: string; date: string; allDay: boolean
  startTime?: string | null; endTime?: string | null
  clientId?: string | null; location?: string | null; notes?: string | null; createdByUserId: string
}

export async function createCalendarEvent(input: CreateCalendarEventInput): Promise<void> {
  const company = await prisma.company.findFirst({ select: { id: true } })
  if (!company) throw new Error('No company configured.')
  const timed = !input.allDay && Boolean(input.startTime)
  const startsAt = timed ? sydneyLocalToUtc(`${input.date}T${input.startTime}`) : sydneyLocalToUtc(`${input.date}T00:00`)
  const endsAt = timed && input.endTime ? sydneyLocalToUtc(`${input.date}T${input.endTime}`) : null
  await prisma.calendarEvent.create({
    data: {
      companyId: company.id, kind: input.kind, title: input.title, startsAt, endsAt, allDay: !timed,
      location: input.location?.trim() || null, notes: input.notes?.trim() || null,
      clientId: input.clientId || null, createdByUserId: input.createdByUserId,
    },
  })
}

/** Move a booking or standalone event to a new Sydney day/time (drag-to-reschedule). Duration is kept. */
export async function moveCalendarItem(kind: 'booking' | 'event', refId: string, dateKey: string, startMin: number | null): Promise<void> {
  const hh = startMin === null ? '00' : pad(Math.floor(startMin / 60))
  const mm = startMin === null ? '00' : pad(startMin % 60)
  const newStart = sydneyLocalToUtc(`${dateKey}T${hh}:${mm}`)
  if (kind === 'booking') {
    const b = await prisma.booking.findUniqueOrThrow({ where: { id: refId }, select: { startsAt: true, endsAt: true } })
    const duration = b.endsAt.getTime() - b.startsAt.getTime()
    await prisma.booking.update({ where: { id: refId }, data: { startsAt: newStart, endsAt: new Date(newStart.getTime() + Math.max(duration, 0)) } })
  } else {
    const e = await prisma.calendarEvent.findUniqueOrThrow({ where: { id: refId }, select: { startsAt: true, endsAt: true, allDay: true } })
    const duration = e.endsAt ? e.endsAt.getTime() - e.startsAt.getTime() : null
    await prisma.calendarEvent.update({
      where: { id: refId },
      data: {
        startsAt: newStart,
        endsAt: duration !== null ? new Date(newStart.getTime() + duration) : null,
        allDay: startMin === null ? true : false,
      },
    })
  }
}

/** Stable per-company iCal subscription token, stored in company.settings (no migration needed). */
export async function getOrCreateFeedToken(): Promise<string> {
  const company = await prisma.company.findFirst({ select: { id: true, settings: true } })
  if (!company) throw new Error('No company configured.')
  const settings = (company.settings ?? {}) as Record<string, unknown>
  const existing = settings.calendarFeedToken
  if (typeof existing === 'string' && existing.length >= 16) return existing
  const token = randomToken()
  await prisma.company.update({
    where: { id: company.id },
    data: { settings: { ...settings, calendarFeedToken: token } as Prisma.InputJsonValue },
  })
  return token
}

function randomToken(): string {
  // 24 hex chars from the platform crypto (Node 20+ exposes a global crypto).
  const bytes = new Uint8Array(12)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

// ---- iCal (.ics) subscription feed ----
function icsEscape(s: string): string {
  return s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n')
}
function icsStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}
function icsDate(d: Date): string {
  const p = sydneyYmd(d)
  return `${p.year}${pad(p.month)}${pad(p.day)}`
}
function vevent(uid: string, dtstamp: string, start: Date, end: Date | null, allDay: boolean, summary: string, location: string | null): string[] {
  const l = ['BEGIN:VEVENT', `UID:${uid}@moments`, `DTSTAMP:${dtstamp}`]
  if (allDay) {
    l.push(`DTSTART;VALUE=DATE:${icsDate(start)}`)
    l.push(`DTEND;VALUE=DATE:${icsDate(new Date(start.getTime() + 86_400_000))}`)
  } else {
    l.push(`DTSTART:${icsStamp(start)}`)
    l.push(`DTEND:${icsStamp(end ?? new Date(start.getTime() + 3_600_000))}`)
  }
  l.push(`SUMMARY:${icsEscape(summary)}`)
  if (location) l.push(`LOCATION:${icsEscape(location)}`)
  l.push('END:VEVENT')
  return l
}

/** Render the company's calendar as an iCal feed, or null when the subscription token is wrong. */
export async function getIcsForToken(token: string): Promise<string | null> {
  if (!token || token.length < 16) return null
  const company = await prisma.company.findFirst({ select: { id: true, name: true, settings: true } })
  if (!company) return null
  const settings = (company.settings ?? {}) as Record<string, unknown>
  if (settings.calendarFeedToken !== token) return null

  const now = systemClock.now()
  const start = new Date(now.getTime() - 30 * 86_400_000)
  const end = new Date(now.getTime() + 365 * 86_400_000)

  const [bookings, events, appts] = await Promise.all([
    prisma.booking.findMany({
      where: { companyId: company.id, startsAt: { gte: start, lt: end }, status: { not: 'CANCELLED' } },
      select: { id: true, title: true, startsAt: true, endsAt: true, location: true, project: { select: { client: { select: { displayName: true } } } } },
    }),
    prisma.calendarEvent.findMany({
      where: { companyId: company.id, startsAt: { gte: start, lt: end } },
      select: { id: true, title: true, startsAt: true, endsAt: true, allDay: true, location: true },
    }),
    prisma.workItem.findMany({
      where: { companyId: company.id, type: 'APPOINTMENT', status: { in: ['PENDING', 'COMPLETED'] } },
      select: { id: true, title: true, dueAt: true, enquiry: { select: { name: true, createdAt: true } }, project: { select: { client: { select: { displayName: true } }, bookings: { orderBy: { startsAt: 'desc' }, take: 1, select: { startsAt: true } } } } },
    }),
  ])

  const dtstamp = icsStamp(now)
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Moments//Calendar//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${icsEscape(company.name)}`]
  for (const b of bookings) lines.push(...vevent(`b_${b.id}`, dtstamp, b.startsAt, b.endsAt, false, `${b.project.client.displayName} - ${b.title?.trim() || 'Shoot'}`, b.location))
  for (const e of events) lines.push(...vevent(`e_${e.id}`, dtstamp, e.startsAt, e.endsAt, e.allDay, e.title, e.location))
  for (const w of appts) {
    const isLead = Boolean(w.enquiry)
    const anchor = isLead ? w.enquiry!.createdAt : (w.project?.bookings[0]?.startsAt ?? null)
    const offset = isLead ? ENQUIRY_TASK_SCHEDULE[w.title] : PROJECT_TASK_SCHEDULE[w.title]
    const date = w.dueAt ?? (anchor && offset !== undefined ? addDays(anchor, offset) : null)
    if (!date || date.getTime() < start.getTime() || date.getTime() >= end.getTime()) continue
    const who = isLead ? w.enquiry!.name : (w.project?.client.displayName ?? 'Job')
    const timed = Boolean(w.dueAt)
    lines.push(...vevent(`w_${w.id}`, dtstamp, date, timed ? new Date(date.getTime() + 30 * 60_000) : null, !timed, `${who} - ${appointmentKind(w.title)}`, null))
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}
