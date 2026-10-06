import { prisma } from '@/lib/db'
import { formatSydneyDate, formatSydneyTime, sydneyLocalToUtc, sydneyYmd, systemClock } from '@/lib/time'
import { addDays, ENQUIRY_TASK_SCHEDULE } from '@/features/enquiries/workflow'
import { STUDIO_TO_ACT } from '@/features/enquiries/status'
import { JOB_SHOOT_SELECT, resolveTaskDueDate, shootDateOfJob, shootHasTime } from './deadline'

/**
 * "Today" - the studio's morning cockpit (BR-CAL). Not a generic task list: it unifies what needs
 * action across the whole studio into one screen - overdue & due-today to-dos, today's shoots, and
 * the leads waiting on a reply - so a staff member opens it and knows exactly how to run the day.
 * Task due dates use the same anchored logic as the board (enquiry date for leads, the job's shoot date
 * for jobs: set on its Shoot task, else the lead's event date).
 */

export type TaskLine = {
  id: string
  title: string
  client: string
  category: 'lead' | 'job'
  href: string
  dueLabel: string
  /** The due instant (ms), so lists sort by real date order, never by the label text. */
  dueMs: number
  overdue: boolean
}
export type ShootLine = { id: string; client: string; title: string; timeLabel: string; href: string }
export type WaitingLead = { id: string; name: string; sinceLabel: string; href: string }

export type TodayCockpit = {
  dateLabel: string
  overdue: TaskLine[]
  todayTasks: TaskLine[]
  upcoming: TaskLine[] // next 7 days (excluding today)
  shootsToday: ShootLine[]
  waitingLeads: WaitingLead[]
  counts: { overdue: number; today: number; shoots: number; waiting: number }
}

export const OPEN_ENQUIRY = ['NEW_ENQUIRY', 'CONTACTED', 'CONSULTATION', 'QUOTE_SENT', 'AWAITING_BOOKING_CONFIRMATION'] as const
export const CLOSED_PROJECT = ['COMPLETED', 'CANCELLED', 'CLOSED'] as const

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
        dueAnchor: true, dueOffsetDays: true, dueDateFixed: true, dueOverrideAt: true,
        enquiry: { select: { id: true, name: true, createdAt: true } },
        project: {
          select: { id: true, confirmedByClientAt: true, client: { select: { displayName: true } }, ...JOB_SHOOT_SELECT },
        },
      },
    }),
    // Live jobs, to find the ones shooting today (their shoot date: Shoot task, else the lead's date).
    prisma.project.findMany({
      where: { lifecycleStatus: { notIn: [...CLOSED_PROJECT] } },
      select: { id: true, client: { select: { displayName: true } }, ...JOB_SHOOT_SELECT },
    }),
    prisma.enquiry.findMany({
      where: { status: { in: [...STUDIO_TO_ACT] } }, // no quote sent yet: the studio's move
      orderBy: { updatedAt: 'asc' },
      select: { id: true, name: true, updatedAt: true },
    }),
  ])

  const overdue: TaskLine[] = []
  const todayTasks: TaskLine[] = []
  const upcoming: TaskLine[] = []

  for (const w of tasks) {
    const isLead = Boolean(w.enquiry)
    // Leads anchor to the enquiry date; jobs use the one deadline resolver (Rule D0).
    let date: Date | null
    if (isLead) {
      const offset = ENQUIRY_TASK_SCHEDULE[w.title]
      date = w.dueAt ?? (offset !== undefined ? addDays(w.enquiry!.createdAt, offset) : null)
    } else {
      date = resolveTaskDueDate(w, {
        shootDate: w.project ? shootDateOfJob(w.project) : null,
        jobConfirmedAt: w.project?.confirmedByClientAt ?? null,
      })
    }
    if (!date) continue // undated tasks (e.g. a job with no shoot date yet) are not "due" yet
    const ms = date.getTime()
    const line: TaskLine = {
      id: w.id, title: w.title,
      client: isLead ? w.enquiry!.name : (w.project?.client.displayName ?? 'Job'),
      category: isLead ? 'lead' : 'job',
      href: isLead ? `/leads/${w.enquiry!.id}` : `/jobs/${w.project!.id}`,
      dueLabel: formatSydneyDate(date),
      dueMs: ms,
      overdue: ms < dayStart.getTime(),
    }
    if (ms < dayStart.getTime()) overdue.push(line)
    else if (ms < dayEnd.getTime()) todayTasks.push(line)
    else if (ms < weekEnd.getTime()) upcoming.push(line)
  }

  const byDue = (a: TaskLine, b: TaskLine) => a.dueMs - b.dueMs || a.client.localeCompare(b.client)
  overdue.sort(byDue); todayTasks.sort(byDue); upcoming.sort(byDue)

  const shootsToday: ShootLine[] = shoots.flatMap((p) => {
    const at = shootDateOfJob(p)
    if (!at || at.getTime() < dayStart.getTime() || at.getTime() >= dayEnd.getTime()) return []
    return [{ id: p.id, client: p.client.displayName, title: 'Shoot', timeLabel: shootHasTime(p) ? formatSydneyTime(at) : 'All day', href: `/jobs/${p.id}` }]
  })
  shootsToday.sort((a, b) => a.timeLabel.localeCompare(b.timeLabel))
  const waitingLeads: WaitingLead[] = waiting.map((e) => ({
    id: e.id, name: e.name, sinceLabel: formatSydneyDate(e.updatedAt), href: `/leads/${e.id}`,
  }))

  return {
    dateLabel: formatSydneyDate(now),
    overdue, todayTasks, upcoming, shootsToday, waitingLeads,
    counts: { overdue: overdue.length, today: todayTasks.length, shoots: shootsToday.length, waiting: waitingLeads.length },
  }
}
