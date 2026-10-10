import { addDays, MS_PER_DAY } from '@/features/enquiries/workflow'
import { sydneyYmd } from '@/lib/time'

export type DueAnchor = 'SHOOT' | 'JOB_CONFIRMED' | 'FIXED' | 'LEAD_CREATED'

export type DeadlineTask = {
  dueAnchor: DueAnchor | null
  dueOffsetDays: number
  dueDateFixed: Date | null
  dueOverrideAt: Date | null
}

export type DeadlineContext = {

  shootDate: Date | null

  jobConfirmedAt: Date | null
}

export const SHOOT_TASK_TYPE = 'SHOOT'

export function jobShootDate(
  tasks: { type: string; status?: string; dueOverrideAt: Date | null }[],
  shootDay: Date | null | undefined,
): Date | null {
  const set = tasks.find((t) => t.type === SHOOT_TASK_TYPE && t.status !== 'CANCELLED' && t.dueOverrideAt)
  return set?.dueOverrideAt ?? shootDay ?? null
}

export const JOB_SHOOT_INCLUDE = {
  workItems: { where: { type: SHOOT_TASK_TYPE }, select: { type: true, status: true, dueOverrideAt: true } },

  convertedFromEnquiries: { select: { id: true, enquiryNumber: true }, orderBy: { createdAt: 'desc' }, take: 1 },
} as const

export const JOB_SHOOT_SELECT = { shootDate: true, shootLocation: true, ...JOB_SHOOT_INCLUDE } as const

export function shootDateOfJob(p: {
  workItems: { type: string; status: string; dueOverrideAt: Date | null }[]
  shootDate: Date | null
}): Date | null {
  return jobShootDate(p.workItems, p.shootDate)
}

export function shootHasTime(p: { workItems: { type: string; status: string; dueOverrideAt: Date | null }[] }): boolean {
  return p.workItems.some((t) => t.type === SHOOT_TASK_TYPE && t.status !== 'CANCELLED' && t.dueOverrideAt != null)
}

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
