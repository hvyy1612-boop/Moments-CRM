import { prisma } from '@/lib/db'
import { formatSydneyDate, formatSydneyTime, sydneyLocalToUtc, sydneyYmd, systemClock } from '@/lib/time'
import { addDays, ENQUIRY_TASK_SCHEDULE } from '@/features/enquiries/workflow'
import { makeShootDateOf, resolveTaskDueDate } from './deadline'

export type TaskLine = {
  id: string
  title: string
  client: string
  category: 'lead' | 'job'
  href: string
  dueLabel: string
  overdue: boolean
}
export type ShootLine = { id: string; client: string; title: string; timeLabel: string; href: string }
export type WaitingLead = { id: string; name: string; sinceLabel: string; href: string }

export type TodayCockpit = {
  dateLabel: string
  overdue: TaskLine[]
  todayTasks: TaskLine[]
  upcoming: TaskLine[]
  shootsToday: ShootLine[]
  waitingLeads: WaitingLead[]
  counts: { overdue: number; today: number; shoots: number; waiting: number }
}

const OPEN_ENQUIRY = ['NEW', 'CONTACTED', 'QUALIFIED'] as const
const CLOSED_PROJECT = ['LOST', 'COMPLETED', 'CANCELLED', 'ARCHIVED', 'CLOSED'] as const

function pad(n: number): string { return String(n).padStart(2, '0') }

export async function getTodayCockpit(): Promise<TodayCockpit> {
  const now = systemClock.now()
  const t = sydneyYmd(now)
  const todayKey = `${t.year}-${pad(t.month)}-${pad(t.day)}`
  const dayStart = sydneyLocalToUtc(`${todayKey}T00:00`)
  const dayEnd = new Date(dayStart.getTime() + 86_400_000)
  const weekEnd = new Date(dayStart.getTime() + 7 * 86_400_000)

  const [tasks, shoots, waiting] = await Promise.all([
    prisma.workItem.findMany({
      where: {
        status: 'PENDING',
        type: { not: 'AUTO' },
        OR: [
          { enquiry: { status: { in: [...OPEN_ENQUIRY] } } },
          { project: { lifecycleStatus: { notIn: [...CLOSED_PROJECT] } } },
        ],
      },
      select: {
        id: true, title: true, dueAt: true,
        dueAnchor: true, dueOffsetDays: true, dueDateFixed: true, dueOverrideAt: true, bookingId: true,
        enquiry: { select: { id: true, name: true, createdAt: true } },
        project: {
          select: {
            id: true, confirmedByClientAt: true, client: { select: { displayName: true } },
            bookings: { select: { id: true, startsAt: true, status: true, rescheduledFromId: true } },
          },
        },
      },
    }),
    prisma.booking.findMany({
      where: { startsAt: { gte: dayStart, lt: dayEnd }, status: { not: 'CANCELLED' } },
      orderBy: { startsAt: 'asc' },
      select: { id: true, title: true, startsAt: true, project: { select: { id: true, client: { select: { displayName: true } } } } },
    }),
    prisma.enquiry.findMany({
      where: { status: { in: [...OPEN_ENQUIRY] }, waitingOn: 'STUDIO' },
      orderBy: { updatedAt: 'asc' },
      select: { id: true, name: true, updatedAt: true },
    }),
  ])

  const overdue: TaskLine[] = []
  const todayTasks: TaskLine[] = []
  const upcoming: TaskLine[] = []

  for (const w of tasks) {
    const isLead = Boolean(w.enquiry)

    let date: Date | null
    if (isLead) {
      const offset = ENQUIRY_TASK_SCHEDULE[w.title]
      date = w.dueAt ?? (offset !== undefined ? addDays(w.enquiry!.createdAt, offset) : null)
    } else {
      date = resolveTaskDueDate(w, {
        shootDateOf: makeShootDateOf(w.project?.bookings ?? []),
        jobConfirmedAt: w.project?.confirmedByClientAt ?? null,
      })
    }
    if (!date) continue
    const ms = date.getTime()
    const line: TaskLine = {
      id: w.id, title: w.title,
      client: isLead ? w.enquiry!.name : (w.project?.client.displayName ?? 'Job'),
      category: isLead ? 'lead' : 'job',
      href: isLead ? `/enquiries/${w.enquiry!.id}` : `/jobs/${w.project!.id}`,
      dueLabel: formatSydneyDate(date),
      overdue: ms < dayStart.getTime(),
    }
    if (ms < dayStart.getTime()) overdue.push(line)
    else if (ms < dayEnd.getTime()) todayTasks.push(line)
    else if (ms < weekEnd.getTime()) upcoming.push(line)
  }

  const byDue = (a: TaskLine, b: TaskLine) => a.dueLabel.localeCompare(b.dueLabel) || a.client.localeCompare(b.client)
  overdue.sort(byDue); todayTasks.sort(byDue); upcoming.sort(byDue)

  const shootsToday: ShootLine[] = shoots.map((b) => ({
    id: b.id, client: b.project.client.displayName, title: b.title?.trim() || 'Shoot',
    timeLabel: formatSydneyTime(b.startsAt), href: `/jobs/${b.project.id}`,
  }))
  const waitingLeads: WaitingLead[] = waiting.map((e) => ({
    id: e.id, name: e.name, sinceLabel: formatSydneyDate(e.updatedAt), href: `/enquiries/${e.id}`,
  }))

  return {
    dateLabel: formatSydneyDate(now),
    overdue, todayTasks, upcoming, shootsToday, waitingLeads,
    counts: { overdue: overdue.length, today: todayTasks.length, shoots: shootsToday.length, waiting: waitingLeads.length },
  }
}
