

import { daysUntilSydney, sydneyDateTimeParts } from '@/lib/time'
import { leadTaskDue } from '@/features/tasks/due'

export type TaskType = 'TODO' | 'AUTO_EMAIL' | 'APPOINTMENT' | 'SHOOT' | 'EXTRA_SHOOT' | 'AUTO'

export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  TODO: '',
  AUTO_EMAIL: 'Auto email',
  APPOINTMENT: 'Appointment',
  SHOOT: 'Main shoot',
  EXTRA_SHOOT: 'Extra shoot',
  AUTO: 'Auto',
}

export type AddableTaskType = { value: TaskType; label: string; detail: string }

const TODO_TYPE: AddableTaskType = { value: 'TODO', label: 'To-do', detail: 'A task you tick when it is done.' }
const APPOINTMENT_TYPE: AddableTaskType = {
  value: 'APPOINTMENT',
  label: 'Appointment',
  detail: 'A meeting or call with the client. Shows in the calendar.',
}

export const LEAD_TASK_TYPES: AddableTaskType[] = [TODO_TYPE, APPOINTMENT_TYPE]

export const JOB_TASK_TYPES: AddableTaskType[] = [
  TODO_TYPE,
  { value: 'EXTRA_SHOOT', label: 'Extra shoot', detail: 'Another shoot for this job. Shows in the calendar.' },
  APPOINTMENT_TYPE,
]

type StageDef = { key: string; label: string; color: string }

export const ENQUIRY_STAGES: StageDef[] = [
  { key: 'new', label: 'New enquiry', color: 'enquiry' },
  { key: 'discussion', label: 'Contacted', color: 'quote' },
  { key: 'quote', label: 'Consultation', color: 'booked' },
]

export const ENQUIRY_STAGE_KEYS: ReadonlySet<string> = new Set(ENQUIRY_STAGES.map((s) => s.key))

export function enquiryStageLabel(key: string): string {
  return ENQUIRY_STAGES.find((s) => s.key === key)?.label ?? key
}

export const DEFAULT_ENQUIRY_TASKS: { stage: string; title: string; type: TaskType; done?: boolean }[] = [
  { stage: 'new', title: 'Send initial enquiry response', type: 'TODO' },
  { stage: 'discussion', title: 'Discuss shoot requirements', type: 'TODO' },
  { stage: 'discussion', title: 'Confirm shoot date and requirements', type: 'TODO' },
  { stage: 'quote', title: 'Prepare client quote', type: 'TODO' },
  { stage: 'quote', title: 'Send client quote', type: 'TODO' },
  { stage: 'quote', title: 'Send contract and deposit invoice', type: 'TODO' },
]

export const ENQUIRY_TASK_NOTE: Record<string, string> = {
  'Enquiry received': 'Logged automatically when the enquiry arrives.',
  'Send initial enquiry response': 'Reply within 24 hours of the enquiry.',
  'Follow up on enquiry': 'Follow up if there is no reply after 2 to 3 days.',
  'Discuss shoot requirements': 'Confirm the date, location, and coverage.',
  'Schedule client consultation': 'Book a call or meeting to talk through the shoot.',
  'Confirm shoot date and requirements': 'Lock the date and scope before quoting.',
  'Prepare client quote': 'Build the quote from the agreed package.',
  'Send client quote': 'Send the quote and note when a reply is due.',
  'Follow up on quote': 'Follow up if the quote is unanswered after 3 days.',
  'Update quote based on client request': 'Revise and resend if the client asks for changes.',
  'Send contract and deposit invoice': 'Send the contract and deposit to secure the booking.',
}

export const ENQUIRY_TASK_SCHEDULE: Record<string, number> = {
  'Send initial enquiry response': 1,
  'Follow up on enquiry': 3,
  'Discuss shoot requirements': 5,
  'Schedule client consultation': 7,
  'Confirm shoot date and requirements': 10,
  'Prepare client quote': 12,
  'Send client quote': 13,
  'Follow up on quote': 16,
  'Update quote based on client request': 18,
  'Send contract and deposit invoice': 20,
}

export function addDays(base: Date, days: number): Date {
  const d = new Date(base.getTime())
  d.setDate(d.getDate() + days)
  return d
}

export const MS_PER_DAY = 86_400_000

export type DueTone = 'overdue' | 'today' | 'soon' | null

export function dueToneFor(dueDate: Date | null, done: boolean, now: Date | null): DueTone {
  if (done || !dueDate || !now) return null

  const diff = daysUntilSydney(dueDate, now)
  if (diff < 0) return 'overdue'
  if (diff === 0) return 'today'
  if (diff <= 3) return 'soon'
  return null
}

export const ENQUIRY_TASK_BLOCKED_BY: Record<string, string> = {
  'Send client quote': 'Prepare client quote',
  'Follow up on quote': 'Send client quote',
  'Send contract and deposit invoice': 'Send client quote',
}

export type TaskInput = {
  id: string
  title: string
  status: string
  stage: string | null
  type: string
  dueAt: Date | null

  dueAnchor?: 'SHOOT' | 'JOB_CONFIRMED' | 'FIXED' | 'LEAD_CREATED' | null
  dueOffsetDays?: number
  dueDateFixed?: Date | null
  order: number
  completedByName: string | null
  completedAt: Date | null
}

export type EnqTaskRow = {
  id: string
  title: string
  type: TaskType
  typeLabel: string
  note: string | null
  editable: boolean
  done: boolean
  dueLabel: string | null
  dueValue: string | null
  noDate: boolean
  dueTone: DueTone
  blocked: boolean
  blockedBy: string | null
  completedByName: string | null
  completedAt: Date | null

  owner: string | null
}
export type EnqStage = {
  key: string
  label: string
  color: string
  active: boolean

  custom: boolean
  done: number
  total: number
  tasks: EnqTaskRow[]
}
export type EnquiryBoard = { stages: EnqStage[]; allDone: boolean }

function isoDate(d: Date): string {
  return sydneyDateTimeParts(d).date
}

export function buildEnquiryBoard(
  tasks: TaskInput[],
  formatDate: (d: Date) => string,
  anchorDate: Date | null = null,
  now: Date | null = null,
  forceAllDone = false,
  ownerName: string | null = null,
): EnquiryBoard {
  const doneTitles = new Set(tasks.filter((t) => t.status === 'COMPLETED').map((t) => t.title))

  const rowsFor = (stageKey: string): EnqTaskRow[] =>
    tasks
      .filter((t) => t.stage === stageKey)
      .sort((a, b) => a.order - b.order)
      .map((t) => {
        const type = (t.type as TaskType) ?? 'TODO'

        const done = forceAllDone || t.status === 'COMPLETED'

        const dueDate: Date | null = forceAllDone
          ? null
          : leadTaskDue({ dueAt: t.dueAt, dueAnchor: t.dueAnchor ?? null, dueOffsetDays: t.dueOffsetDays ?? 0, dueDateFixed: t.dueDateFixed ?? null }, anchorDate).date
        const noDate = false
        const blockedBy = ENQUIRY_TASK_BLOCKED_BY[t.title] ?? null
        return {
          id: t.id,
          title: t.title,
          type,
          typeLabel: TASK_TYPE_LABEL[type] ?? '',
          note: ENQUIRY_TASK_NOTE[t.title] ?? null,
          editable: type !== 'AUTO',
          done,
          dueLabel: dueDate ? formatDate(dueDate) : null,
          dueValue: dueDate ? isoDate(dueDate) : null,
          noDate,
          dueTone: dueToneFor(dueDate, done, now),
          blocked: !done && blockedBy ? !doneTitles.has(blockedBy) : false,
          blockedBy,
          completedByName: t.completedByName,
          completedAt: t.completedAt,
          owner: ownerName,
        }
      })

  const toStage = (key: string, label: string, color: string, custom: boolean): EnqStage => {
    const stageTasks = rowsFor(key)
    return {
      key,
      label,
      color,
      active: false,
      custom,
      done: stageTasks.filter((t) => t.done).length,
      total: stageTasks.length,
      tasks: stageTasks,
    }
  }

  const coreStages = ENQUIRY_STAGES.map((s) => toStage(s.key, s.label, s.color, false))

  let activeKey: string | null = null
  for (const s of coreStages) {
    if (activeKey === null && s.tasks.some((t) => !t.done)) activeKey = s.key
  }
  for (const s of coreStages) s.active = s.key === activeKey

  const firstOrder = new Map<string, number>()
  for (const t of tasks) {
    if (!t.stage || ENQUIRY_STAGE_KEYS.has(t.stage)) continue
    const prev = firstOrder.get(t.stage)
    if (prev === undefined || t.order < prev) firstOrder.set(t.stage, t.order)
  }
  const customStages = [...firstOrder.keys()]
    .sort((a, b) => firstOrder.get(a)! - firstOrder.get(b)! || a.localeCompare(b))
    .map((key) => toStage(key, key, 'enquiry', true))

  return { stages: [...coreStages, ...customStages], allDone: activeKey === null }
}
