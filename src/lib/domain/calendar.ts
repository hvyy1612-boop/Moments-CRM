import { timingSafeEqual } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { daysUntilSydney, formatSydneyTime, sydneyLocalToUtc, sydneyYmd, systemClock } from '@/lib/time'
import { leadTaskDue } from '@/features/tasks/due'
import { JOB_SHOOT_SELECT, resolveTaskDueDate, shootDateOfJob, shootHasTime, type DueAnchor } from './deadline'
import { CLOSED_PROJECT, OPEN_ENQUIRY } from './today'

const LIVE_WORK: Prisma.WorkItemWhereInput[] = [
  { enquiry: { status: { in: [...OPEN_ENQUIRY] } } },

  { project: { lifecycleStatus: { notIn: [...CLOSED_PROJECT, 'BOOKING_REQUESTED'] } } },
]

export type CalCategory = 'lead' | 'job' | 'event' | 'payment'
export type CalendarFilter = 'all' | 'lead' | 'job' | 'event' | 'payment'
export type CalendarView = 'month' | 'week'

export type CalItem = {
  id: string
  kind: 'shoot' | 'event' | 'appointment' | 'task'
  refId: string
  dayKey: string
  startMin: number | null
  endMin: number | null
  primary: string
  secondary: string | null
  category: CalCategory
  tone: 'overdue' | 'today' | 'soon' | null
  timeLabel: string | null
  href: string | null
  editable: boolean
  location: string | null
  status: string | null
  conflict: boolean
  done: boolean
}

export type CalendarViewData = {
  view: CalendarView
  anchorKey: string
  label: string
  prevKey: string
  nextKey: string
  todayKey: string
  todayDateKey: string
  items: CalItem[]
  conflictCount: number

  month: { year: number; monthNum: number; daysInMonth: number; leading: number; todayDay: number | null } | null

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
  const diff = daysUntilSydney(new Date(dueMs), new Date(nowMs))
  if (diff < 0) return 'overdue'
  if (diff === 0) return 'today'
  if (diff <= 3) return 'soon'
  return null
}

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
  if (w.enquiry) return leadTaskDue(w, w.enquiry.createdAt)
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

function sameToken(stored: unknown, given: string): boolean {
  if (typeof stored !== 'string') return false
  const a = Buffer.from(stored)
  const b = Buffer.from(given)
  return a.length === b.length && timingSafeEqual(a, b)
}

function randomToken(): string {

  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

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
