import { timingSafeEqual } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { daysUntilSydney, formatSydneyTime, sydneyLocalToUtc, sydneyYmd, systemClock } from '@/lib/time'
import { addDays, ENQUIRY_TASK_SCHEDULE } from '@/features/enquiries/workflow'
import { JOB_SHOOT_SELECT, resolveTaskDueDate, shootDateOfJob, shootHasTime, type DueAnchor } from './deadline'
import { CLOSED_PROJECT, OPEN_ENQUIRY } from './today'

// Only work that is still live belongs on the calendar: open leads and jobs that are not cancelled or
// finished (same rule as the Today view), so a stopped job's leftover to-dos never sit there red forever.
const LIVE_WORK: Prisma.WorkItemWhereInput[] = [
  { enquiry: { status: { in: [...OPEN_ENQUIRY] } } },
  // Jobs only: a lead's booking file (deposit not paid) is not a job, so none of its tasks show.
  { project: { lifecycleStatus: { notIn: [...CLOSED_PROJECT, 'BOOKING_REQUESTED'] } } },
]

/**
 * Calendar aggregation (BR-CAL). The calendar is DERIVED - it lays what staff already entered onto a
 * Month or Week grid so nothing is typed twice:
 *   - Shoots are each live job's shoot date (its Shoot task, else the lead's event date); workflow
 *     appointments come from APPOINTMENT work items (lead or job),
 *     using the same anchored due dates as the board; standalone entries from CalendarEvent.
 * Every position (which day, which hour) is computed in the Sydney zone so a late event lands on the
 * right day/slot regardless of the server's own time zone. Overlapping shoots are flagged as a
 * conflict so a double-booking is caught immediately.
 */

export type CalCategory = 'lead' | 'job' | 'event' | 'payment'
export type CalendarFilter = 'all' | 'lead' | 'job' | 'event' | 'payment'
export type CalendarView = 'month' | 'week'

export type CalItem = {
  id: string // stable dom id, e.g. b_<id>
  kind: 'shoot' | 'event' | 'appointment' | 'task'
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
  editable: boolean // draggable (standalone events only; a shoot date is changed on the job's Shoot task)
  location: string | null
  status: string | null // invoice status for payment items
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
  const diff = daysUntilSydney(new Date(dueMs), new Date(nowMs)) // Sydney calendar days, like the board
  if (diff < 0) return 'overdue'
  if (diff === 0) return 'today'
  if (diff <= 3) return 'soon'
  return null
}

/** Fetch every calendar item whose Sydney day falls in [startUtc, endUtc), flag shoot conflicts. */

/**
 * A work item's effective calendar date. Leads anchor to the enquiry date + schedule offset (manual
 * dueAt wins). Jobs go through the one deadline resolver (docs/25 Rule D0): shoot-anchored tasks follow
 * the job's shoot date. `timed` marks a manually dated item (which carries a time-of-day) vs an anchored
 * all-day marker.
 */
type CalWorkItem = {
  title: string
  dueAt: Date | null
  dueAnchor: DueAnchor | null
  dueOffsetDays: number
  dueDateFixed: Date | null
  dueOverrideAt: Date | null
  enquiry: { createdAt: Date } | null
  project:
    | ({ confirmedByClientAt: Date | null } & Parameters<typeof shootDateOfJob>[0])
    | null
}

function resolveCalendarDate(w: CalWorkItem): { date: Date | null; timed: boolean } {
  if (w.enquiry) {
    const offset = ENQUIRY_TASK_SCHEDULE[w.title]
    const date = w.dueAt ?? (offset !== undefined ? addDays(w.enquiry.createdAt, offset) : null)
    return { date, timed: Boolean(w.dueAt) }
  }
  const date = resolveTaskDueDate(w, {
    shootDate: w.project ? shootDateOfJob(w.project) : null,
    jobConfirmedAt: w.project?.confirmedByClientAt ?? null,
  })
  return { date, timed: Boolean(w.dueOverrideAt) }
}

async function fetchItems(startUtc: Date, endUtc: Date, filter: CalendarFilter, now: Date): Promise<CalItem[]> {
  const nowMs = now.getTime()
  const want = (c: CalCategory) => filter === 'all' || filter === c
  const items: CalItem[] = []

  // Shoots - category job: each live job's shoot date (set on its Shoot task, else the lead's date). A
  // lead's booking file is left out: its date is not held until the deposit is paid.
  if (want('job')) {
    const jobs = await prisma.project.findMany({
      where: { lifecycleStatus: { notIn: ['BOOKING_REQUESTED', 'CANCELLED', 'CLOSED'] } },
      select: { id: true, client: { select: { displayName: true } }, ...JOB_SHOOT_SELECT },
    })
    for (const j of jobs) {
      const at = shootDateOfJob(j)
      if (!at || at.getTime() < startUtc.getTime() || at.getTime() >= endUtc.getTime()) continue
      const timed = shootHasTime(j)
      items.push({
        id: `s_${j.id}`, kind: 'shoot', refId: j.id, dayKey: sydneyDateKey(at),
        startMin: timed ? sydneyMinutes(at) : null, endMin: null,
        primary: j.client.displayName, secondary: 'Shoot',
        category: 'job', tone: null, timeLabel: timed ? formatSydneyTime(at) : null,
        href: `/jobs/${j.id}`, editable: false, location: null,
        status: null, conflict: false, done: false,
      })
    }
    // Extra shoots staff added to a job's workflow: shoots too (and checked for same-day clashes).
    const extras = await prisma.workItem.findMany({
      where: {
        type: 'EXTRA_SHOOT',
        status: { in: ['PENDING', 'COMPLETED'] },
        dueOverrideAt: { gte: startUtc, lt: endUtc },
        project: { lifecycleStatus: { notIn: ['BOOKING_REQUESTED', 'CANCELLED', 'CLOSED'] } },
      },
      select: { id: true, title: true, dueOverrideAt: true, status: true, project: { select: { id: true, client: { select: { displayName: true } } } } },
    })
    for (const w of extras) {
      const at = w.dueOverrideAt!
      items.push({
        id: `x_${w.id}`, kind: 'shoot', refId: w.id, dayKey: sydneyDateKey(at),
        startMin: sydneyMinutes(at), endMin: null,
        primary: w.project!.client.displayName, secondary: w.title,
        category: 'job', tone: null, timeLabel: formatSydneyTime(at),
        href: `/jobs/${w.project!.id}`, editable: false, location: null,
        status: null, conflict: false, done: w.status === 'COMPLETED',
      })
    }
  }

  // Appointments (APPOINTMENT work items) - lead or job.
  if (want('lead') || want('job')) {
    const appts = await prisma.workItem.findMany({
      where: { type: 'APPOINTMENT', status: { in: ['PENDING', 'COMPLETED'] }, OR: LIVE_WORK },
      select: { id: true, title: true, dueAt: true, status: true,
        dueAnchor: true, dueOffsetDays: true, dueDateFixed: true, dueOverrideAt: true,
        enquiry: { select: { id: true, name: true, createdAt: true } },
        project: { select: { id: true, confirmedByClientAt: true, client: { select: { displayName: true } }, ...JOB_SHOOT_SELECT } } },
    })
    for (const w of appts) {
      const isLead = Boolean(w.enquiry)
      const category: CalCategory = isLead ? 'lead' : 'job'
      if (!want(category)) continue
      const { date, timed } = resolveCalendarDate(w)
      if (!date || date.getTime() < startUtc.getTime() || date.getTime() >= endUtc.getTime()) continue
      const done = w.status === 'COMPLETED'
      items.push({
        id: `w_${w.id}`, kind: 'appointment', refId: w.id, dayKey: sydneyDateKey(date),
        startMin: timed ? sydneyMinutes(date) : null, endMin: null,
        primary: isLead ? w.enquiry!.name : (w.project?.client.displayName ?? 'Job'),
        secondary: appointmentKind(w.title), category, tone: tone(date.getTime(), done, nowMs),
        timeLabel: timed ? formatSydneyTime(date) : null,
        href: isLead ? `/leads/${w.enquiry!.id}` : `/jobs/${w.project!.id}`,
        editable: false, location: null, status: null, conflict: false, done,
      })
    }
  }

  // Upcoming workflow tasks (to-dos with a due date) - HoneyBook / Google-Tasks style. A task the
  // staff gave an explicit date AND time (a manual override) sits in that time slot; an anchored task
  // with no set time stays an informational all-day marker. Overdue is toned red. APPOINTMENT (shown
  // above), EXTRA_SHOOT (shown as shoots) and AUTO (system rows) are excluded. Job tasks only appear once they have a resolvable date.
  if (want('lead') || want('job')) {
    const tasks = await prisma.workItem.findMany({
      where: { type: { notIn: ['APPOINTMENT', 'AUTO', 'EXTRA_SHOOT'] }, status: 'PENDING', OR: LIVE_WORK },
      select: { id: true, title: true, dueAt: true,
        dueAnchor: true, dueOffsetDays: true, dueDateFixed: true, dueOverrideAt: true,
        enquiry: { select: { id: true, name: true, createdAt: true } },
        project: { select: { id: true, confirmedByClientAt: true, client: { select: { displayName: true } }, ...JOB_SHOOT_SELECT } } },
    })
    for (const w of tasks) {
      const isLead = Boolean(w.enquiry)
      const category: CalCategory = isLead ? 'lead' : 'job'
      if (!want(category)) continue
      const { date, timed } = resolveCalendarDate(w)
      if (!date || date.getTime() < startUtc.getTime() || date.getTime() >= endUtc.getTime()) continue
      items.push({
        id: `t_${w.id}`, kind: 'task', refId: w.id, dayKey: sydneyDateKey(date),
        startMin: timed ? sydneyMinutes(date) : null, endMin: null,
        primary: w.title, secondary: isLead ? w.enquiry!.name : (w.project?.client.displayName ?? 'Job'),
        category, tone: tone(date.getTime(), false, nowMs), timeLabel: timed ? formatSydneyTime(date) : null,
        href: isLead ? `/leads/${w.enquiry!.id}` : `/jobs/${w.project!.id}`,
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

  // Invoice due dates - category payment. Read-only projection of Invoice.dueAt (no new data model);
  // only outstanding invoices (issued/sent/part-paid/overdue) so paid & draft rows stay quiet. All-day.
  if (want('payment')) {
    const invoices = await prisma.invoice.findMany({
      where: { dueAt: { gte: startUtc, lt: endUtc }, status: { in: ['ISSUED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'] } },
      select: {
        id: true, invoiceNumber: true, dueAt: true, status: true,
        project: { select: { client: { select: { displayName: true } } } },
      },
    })
    for (const inv of invoices) {
      if (!inv.dueAt) continue
      items.push({
        id: `inv_${inv.id}`, kind: 'task', refId: inv.id, dayKey: sydneyDateKey(inv.dueAt),
        startMin: null, endMin: null,
        primary: 'Invoice due', secondary: inv.project.client.displayName,
        category: 'payment', tone: tone(inv.dueAt.getTime(), false, nowMs), timeLabel: null,
        href: `/finance/${inv.id}`, editable: false, location: null,
        status: inv.status, conflict: false, done: false,
      })
    }
  }

  flagConflicts(items)
  return items
}

/** Two jobs shooting on the same day are a possible double-booking (a wedding studio's classic clash). */
function flagConflicts(items: CalItem[]): void {
  const byDay = new Map<string, CalItem[]>()
  for (const i of items) if (i.kind === 'shoot') byDay.set(i.dayKey, [...(byDay.get(i.dayKey) ?? []), i])
  for (const same of byDay.values()) if (same.length > 1) for (const i of same) i.conflict = true
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
    label = `${MONTHS[anchor.m - 1]} ${anchor.y}`
    week = { days, startHour: 0, endHour: 24 }
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

/** Move a standalone calendar event to a new Sydney day/time (drag-to-reschedule). Duration is kept. A
 *  job's shoot date is changed on its Shoot task (or by a change request), never by dragging. */
export async function moveCalendarEvent(refId: string, dateKey: string, startMin: number | null): Promise<void> {
  const hh = startMin === null ? '00' : pad(Math.floor(startMin / 60))
  const mm = startMin === null ? '00' : pad(startMin % 60)
  const newStart = sydneyLocalToUtc(`${dateKey}T${hh}:${mm}`)
  const e = await prisma.calendarEvent.findUniqueOrThrow({ where: { id: refId }, select: { startsAt: true, endsAt: true } })
  const duration = e.endsAt ? e.endsAt.getTime() - e.startsAt.getTime() : null
  await prisma.calendarEvent.update({
    where: { id: refId },
    data: {
      startsAt: newStart,
      endsAt: duration !== null ? new Date(newStart.getTime() + duration) : null,
      allDay: startMin === null,
    },
  })
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

/**
 * Issue a NEW subscription link and retire the old one at once (admin, e.g. after a phone is lost or the
 * link was shared by mistake). Every subscribed calendar must be re-subscribed with the new link.
 */
export async function rotateFeedToken(actorUserId: string): Promise<string> {
  const company = await prisma.company.findFirst({ select: { id: true, settings: true } })
  if (!company) throw new Error('No company configured.')
  const settings = (company.settings ?? {}) as Record<string, unknown>
  const token = randomToken()
  await prisma.$transaction([
    prisma.company.update({ where: { id: company.id }, data: { settings: { ...settings, calendarFeedToken: token } as Prisma.InputJsonValue } }),
    prisma.auditLog.create({ data: { companyId: company.id, action: 'calendar.feed_link_reset', entityType: 'Company', entityId: company.id, actorUserId } }),
  ])
  return token
}

/** Constant-time token comparison, so response timing never leaks how much of a guess was right. */
function sameToken(stored: unknown, given: string): boolean {
  if (typeof stored !== 'string') return false
  const a = Buffer.from(stored)
  const b = Buffer.from(given)
  return a.length === b.length && timingSafeEqual(a, b)
}

function randomToken(): string {
  // 32 hex chars (128 bits) from the platform crypto (Node 20+ exposes a global crypto).
  const bytes = new Uint8Array(16)
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
  if (!sameToken(settings.calendarFeedToken, token)) return null

  const now = systemClock.now()
  const start = new Date(now.getTime() - 30 * 86_400_000)
  const end = new Date(now.getTime() + 365 * 86_400_000)

  const [jobs, events, appts, extras] = await Promise.all([
    prisma.project.findMany({
      where: { companyId: company.id, lifecycleStatus: { notIn: ['BOOKING_REQUESTED', 'CANCELLED', 'CLOSED'] } },
      select: { id: true, client: { select: { displayName: true } }, ...JOB_SHOOT_SELECT },
    }),
    prisma.calendarEvent.findMany({
      where: { companyId: company.id, startsAt: { gte: start, lt: end } },
      select: { id: true, title: true, startsAt: true, endsAt: true, allDay: true, location: true },
    }),
    prisma.workItem.findMany({
      where: { companyId: company.id, type: 'APPOINTMENT', status: { in: ['PENDING', 'COMPLETED'] }, OR: LIVE_WORK },
      select: { id: true, title: true, dueAt: true, dueAnchor: true, dueOffsetDays: true, dueDateFixed: true, dueOverrideAt: true, enquiry: { select: { name: true, createdAt: true } }, project: { select: { confirmedByClientAt: true, client: { select: { displayName: true } }, ...JOB_SHOOT_SELECT } } },
    }),
    prisma.workItem.findMany({
      where: {
        companyId: company.id,
        type: 'EXTRA_SHOOT',
        status: { in: ['PENDING', 'COMPLETED'] },
        dueOverrideAt: { gte: start, lt: end },
        project: { lifecycleStatus: { notIn: ['BOOKING_REQUESTED', 'CANCELLED', 'CLOSED'] } },
      },
      select: { id: true, title: true, dueOverrideAt: true, project: { select: { client: { select: { displayName: true } } } } },
    }),
  ])

  const dtstamp = icsStamp(now)
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Moments//Calendar//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${icsEscape(company.name)}`]
  for (const j of jobs) {
    const at = shootDateOfJob(j)
    if (!at || at.getTime() < start.getTime() || at.getTime() >= end.getTime()) continue
    const timed = shootHasTime(j)
    lines.push(...vevent(`s_${j.id}`, dtstamp, at, timed ? new Date(at.getTime() + 60 * 60_000) : null, !timed, `${j.client.displayName} - Shoot`, null))
  }
  for (const w of extras) {
    const at = w.dueOverrideAt!
    lines.push(...vevent(`x_${w.id}`, dtstamp, at, new Date(at.getTime() + 60 * 60_000), false, `${w.project!.client.displayName} - ${w.title}`, null))
  }
  for (const e of events) lines.push(...vevent(`e_${e.id}`, dtstamp, e.startsAt, e.endsAt, e.allDay, e.title, e.location))
  for (const w of appts) {
    const isLead = Boolean(w.enquiry)
    const { date, timed } = resolveCalendarDate(w)
    if (!date || date.getTime() < start.getTime() || date.getTime() >= end.getTime()) continue
    const who = isLead ? w.enquiry!.name : (w.project?.client.displayName ?? 'Job')
    lines.push(...vevent(`w_${w.id}`, dtstamp, date, timed ? new Date(date.getTime() + 30 * 60_000) : null, !timed, `${who} - ${appointmentKind(w.title)}`, null))
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}
