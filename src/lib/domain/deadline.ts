import { addDays, MS_PER_DAY } from '@/features/enquiries/workflow'
import { sydneyYmd } from '@/lib/time'

/**
 * Deadline foundation (docs/25 Part 2) — the ONE place a job task's effective due date and due-state
 * are computed. The board, the Today cockpit and the cron reminders all read through
 * `resolveTaskDueDate` + `getTaskDueState`; no caller re-adds an offset of its own (Rule D0).
 * Rescheduling never shifts a stored date - it moves the anchor (the job's shoot date) and the next
 * resolve yields the new dates (Rule D2).
 *
 * Scope: PROJECT/job tasks (the three anchors below). Enquiry/lead tasks are a separate funnel anchored
 * to the enquiry date and are resolved by the enquiry workflow, not here.
 */

/** How a task's base due date is derived. There is no MANUAL anchor — a manual date is `dueOverrideAt`
 *  (Rule D1). `null` = the task is not date-anchored (no due date unless overridden). */
export type DueAnchor = 'SHOOT' | 'JOB_CONFIRMED' | 'FIXED' | 'LEAD_CREATED' // LEAD_CREATED: lead tasks only (features/tasks/due)

export type DeadlineTask = {
  dueAnchor: DueAnchor | null
  dueOffsetDays: number
  dueDateFixed: Date | null
  dueOverrideAt: Date | null
}

export type DeadlineContext = {
  /** The job's shoot date ({@link jobShootDate}), or null when neither staff nor the lead gave one. */
  shootDate: Date | null
  /** When the booking was confirmed (deposit paid / contract signed), or null while provisional. */
  jobConfirmedAt: Date | null
}

/** The workflow task type that carries the shoot date (the "Mark shoot completed" step). */
export const SHOOT_TASK_TYPE = 'SHOOT'

/**
 * The job's shoot date (Studio Ninja: the job date) - ONE rule for the board, Today, the calendar,
 * reminders and every list: the date staff set on the job's Shoot task; until they set one, the wedding /
 * event date the lead gave. Shoot-anchored tasks follow it, so changing it moves them all.
 */
export function jobShootDate(
  tasks: { type: string; status?: string; dueOverrideAt: Date | null }[],
  eventDate: Date | null | undefined,
): Date | null {
  const set = tasks.find((t) => t.type === SHOOT_TASK_TYPE && t.status !== 'CANCELLED' && t.dueOverrideAt)
  return set?.dueOverrideAt ?? eventDate ?? null
}

/** What a project query selects to know its shoot date (pass the row to {@link shootDateOfJob}). */
export const JOB_SHOOT_SELECT = {
  workItems: { where: { type: SHOOT_TASK_TYPE }, select: { type: true, status: true, dueOverrideAt: true } },
  convertedFromEnquiries: { select: { id: true, enquiryNumber: true, eventDate: true, eventLocation: true, ceremonyLocation: true }, orderBy: { createdAt: 'desc' }, take: 1 },
} as const

/** The shoot date of a project row fetched with {@link JOB_SHOOT_SELECT}. */
export function shootDateOfJob(p: {
  workItems: { type: string; status: string; dueOverrideAt: Date | null }[]
  convertedFromEnquiries: { eventDate: Date | null }[]
}): Date | null {
  return jobShootDate(p.workItems, p.convertedFromEnquiries[0]?.eventDate)
}

/** True when the shoot date carries a time staff set (an event date from the lead is a day only). */
export function shootHasTime(p: { workItems: { type: string; status: string; dueOverrideAt: Date | null }[] }): boolean {
  return p.workItems.some((t) => t.type === SHOOT_TASK_TYPE && t.status !== 'CANCELLED' && t.dueOverrideAt != null)
}

/** The task's effective due date (Rule D0). Override wins; then the anchor; else null. */
export function resolveTaskDueDate(task: DeadlineTask, ctx: DeadlineContext): Date | null {
  if (task.dueOverrideAt) return task.dueOverrideAt
  switch (task.dueAnchor) {
    case 'FIXED':
      return task.dueDateFixed
    case 'JOB_CONFIRMED':
      return ctx.jobConfirmedAt ? addDays(ctx.jobConfirmedAt, task.dueOffsetDays) : null
    case 'SHOOT':
      return ctx.shootDate ? addDays(ctx.shootDate, task.dueOffsetDays) : null
    default:
      return null
  }
}

export type DueTone = 'OVERDUE' | 'TODAY' | 'SOON' | 'LATER' | 'NONE'

/** The Sydney calendar day of an instant as a whole-day number, so tone boundaries fall on Sydney
 *  midnights regardless of the server clock or DST (Rule N9). */
function sydneyDayNumber(d: Date): number {
  const { year, month, day } = sydneyYmd(d)
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY)
}

/** Tone for a resolved due date relative to `now`, in Sydney business days. SOON = 1–3 days out. */
export function dueToneFor(dueAt: Date | null, now: Date): DueTone {
  if (!dueAt) return 'NONE'
  const diff = sydneyDayNumber(dueAt) - sydneyDayNumber(now)
  if (diff < 0) return 'OVERDUE'
  if (diff === 0) return 'TODAY'
  if (diff <= 3) return 'SOON'
  return 'LATER'
}

/** Resolve + tone in one call (Rule D0), for the board / Today / cron. */
export function getTaskDueState(
  task: DeadlineTask,
  ctx: DeadlineContext,
  now: Date,
): { dueAt: Date | null; tone: DueTone } {
  const dueAt = resolveTaskDueDate(task, ctx)
  return { dueAt, tone: dueToneFor(dueAt, now) }
}
