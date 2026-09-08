import { addDays, MS_PER_DAY } from '@/features/enquiries/workflow'
import { sydneyYmd } from '@/lib/time'

/**
 * Deadline foundation (docs/25 Part 2) — the ONE place a job task's effective due date and due-state
 * are computed. The board, the Today cockpit and the cron reminders all read through
 * `resolveTaskDueDate` + `getTaskDueState`; no caller re-finds a booking or re-adds an offset of its
 * own (Rule D0). Rescheduling never shifts a stored date — it moves the anchor source (the active
 * booking) and the next resolve yields the new dates (Rule D2).
 *
 * Scope: PROJECT/job tasks (the three anchors below). Enquiry/lead tasks are a separate funnel anchored
 * to the enquiry date and are resolved by the enquiry workflow, not here.
 */

/** How a task's base due date is derived. There is no MANUAL anchor — a manual date is `dueOverrideAt`
 *  (Rule D1). `null` = the task is not date-anchored (no due date unless overridden). */
export type DueAnchor = 'SHOOT' | 'JOB_CONFIRMED' | 'FIXED'

export type DeadlineTask = {
  dueAnchor: DueAnchor | null
  dueOffsetDays: number
  dueDateFixed: Date | null
  dueOverrideAt: Date | null
  /** For SHOOT tasks: which shoot this task depends on (multi-shoot jobs). null = the job's primary shoot. */
  bookingId: string | null
}

export type DeadlineContext = {
  /**
   * The active (non-cancelled) shoot date for a booking id, or the job's primary (earliest active)
   * shoot when `bookingId` is null. Never "the latest by startsAt" (Rule D3): a multi-shoot job
   * resolves each SHOOT task against its own booking; an unlinked task falls back to the primary shoot.
   */
  shootDateOf: (bookingId: string | null) => Date | null
  /** When the job was confirmed (contract signed / client confirmed), or null. */
  jobConfirmedAt: Date | null
}

/** The task's effective due date (Rule D0). Override wins; then the anchor; else null. */
export function resolveTaskDueDate(task: DeadlineTask, ctx: DeadlineContext): Date | null {
  if (task.dueOverrideAt) return task.dueOverrideAt
  switch (task.dueAnchor) {
    case 'FIXED':
      return task.dueDateFixed
    case 'JOB_CONFIRMED':
      return ctx.jobConfirmedAt ? addDays(ctx.jobConfirmedAt, task.dueOffsetDays) : null
    case 'SHOOT': {
      const shoot = ctx.shootDateOf(task.bookingId)
      return shoot ? addDays(shoot, task.dueOffsetDays) : null
    }
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

/**
 * Build a `shootDateOf` from a job's bookings. Cancelled bookings are excluded; a cancelled booking
 * that was rescheduled resolves to its active successor's date, so a SHOOT task linked to the old
 * booking id automatically follows the reschedule (Rule D3/D5) even before its `bookingId` is repointed.
 * `null` returns the job's primary (earliest active) shoot.
 */
export type BookingLike = {
  id: string
  startsAt: Date
  status: string
  rescheduledFromId: string | null
}

export function makeShootDateOf(bookings: BookingLike[]): (bookingId: string | null) => Date | null {
  const active = bookings.filter((b) => b.status !== 'CANCELLED')
  const activeById = new Map(active.map((b) => [b.id, b]))
  // successor lookup: old booking id -> the active booking that replaced it
  const successorOf = new Map<string, BookingLike>()
  for (const b of active) {
    if (b.rescheduledFromId) successorOf.set(b.rescheduledFromId, b)
  }
  const primary = active.slice().sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0] ?? null
  return (bookingId: string | null): Date | null => {
    if (bookingId === null) return primary ? primary.startsAt : null
    const direct = activeById.get(bookingId)
    if (direct) return direct.startsAt
    const successor = successorOf.get(bookingId)
    return successor ? successor.startsAt : null
  }
}
