import { addDays, MS_PER_DAY } from '@/features/enquiries/workflow'
import { sydneyYmd } from '@/lib/time'

export type DueAnchor = 'SHOOT' | 'JOB_CONFIRMED' | 'FIXED'

export type DeadlineTask = {
  dueAnchor: DueAnchor | null
  dueOffsetDays: number
  dueDateFixed: Date | null
  dueOverrideAt: Date | null

  bookingId: string | null
}

export type DeadlineContext = {

  shootDateOf: (bookingId: string | null) => Date | null

  jobConfirmedAt: Date | null
}

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

function sydneyDayNumber(d: Date): number {
  const { year, month, day } = sydneyYmd(d)
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY)
}

export function dueToneFor(dueAt: Date | null, now: Date): DueTone {
  if (!dueAt) return 'NONE'
  const diff = sydneyDayNumber(dueAt) - sydneyDayNumber(now)
  if (diff < 0) return 'OVERDUE'
  if (diff === 0) return 'TODAY'
  if (diff <= 3) return 'SOON'
  return 'LATER'
}

export function getTaskDueState(
  task: DeadlineTask,
  ctx: DeadlineContext,
  now: Date,
): { dueAt: Date | null; tone: DueTone } {
  const dueAt = resolveTaskDueDate(task, ctx)
  return { dueAt, tone: dueToneFor(dueAt, now) }
}

export type BookingLike = {
  id: string
  startsAt: Date
  status: string
  rescheduledFromId: string | null
}

export function makeShootDateOf(bookings: BookingLike[]): (bookingId: string | null) => Date | null {
  const active = bookings.filter((b) => b.status !== 'CANCELLED')
  const activeById = new Map(active.map((b) => [b.id, b]))

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
