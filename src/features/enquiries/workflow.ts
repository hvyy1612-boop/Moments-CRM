/**
 * Lead workflow (the `Enquiry` record; staff call it a Lead) - editable per case. Its three task groups
 * carry the names of the three early stages they drive, so the board and the stage pill read alike:
 * "New enquiry" (first response), "Contacted" (discuss the shoot), "Consultation" (quote, contract,
 * deposit). The stage is the group of the earliest unfinished task (enquiry-stage.ts); Quote sent /
 * Awaiting booking confirmation / Booking confirmed come from real events, never from ticking tasks.
 * Tasks carry a type; plain To-do shows no tag.
 */

import { daysUntilSydney, sydneyDateTimeParts } from '@/lib/time'
import { leadTaskDue } from '@/features/tasks/due'

// SHOOT = the job's MAIN shoot task (its date is the job's shoot date). EXTRA_SHOOT = an additional shoot
// staff add to a job; it shows in the calendar but never changes the main shoot date. AUTO_EMAIL is only
// kept to label old rows - no email automation is built, so it cannot be added.
export type TaskType = 'TODO' | 'AUTO_EMAIL' | 'APPOINTMENT' | 'SHOOT' | 'EXTRA_SHOOT' | 'AUTO'

export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  TODO: '',
  AUTO_EMAIL: 'Auto email',
  APPOINTMENT: 'Appointment',
  SHOOT: 'Main shoot',
  EXTRA_SHOOT: 'Extra shoot',
  AUTO: 'Auto',
}

/** One choice in "Add task" (Studio Ninja's "Add a New Workflow Task", without Automation for now). */
export type AddableTaskType = { value: TaskType; label: string; detail: string }

const TODO_TYPE: AddableTaskType = { value: 'TODO', label: 'To-do', detail: 'A task you tick when it is done.' }
const APPOINTMENT_TYPE: AddableTaskType = {
  value: 'APPOINTMENT',
  label: 'Appointment',
  detail: 'A meeting or call with the client. Shows in the calendar.',
}

/** What staff can add to a LEAD's workflow (a lead has no shoot booked yet). */
export const LEAD_TASK_TYPES: AddableTaskType[] = [TODO_TYPE, APPOINTMENT_TYPE]

/** What staff can add to a JOB's workflow. */
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

/** Default suggested flow a new enquiry is seeded with: the 3 essential tasks per phase. Staff can add
 *  more or edit them per case (e.g. "Follow up", "Schedule consultation") - this is just a lean start. */
export const DEFAULT_ENQUIRY_TASKS: { stage: string; title: string; type: TaskType; done?: boolean }[] = [
  { stage: 'new', title: 'Send initial enquiry response', type: 'TODO' },
  { stage: 'discussion', title: 'Discuss shoot requirements', type: 'TODO' },
  { stage: 'discussion', title: 'Confirm shoot date and requirements', type: 'TODO' },
  { stage: 'quote', title: 'Prepare client quote', type: 'TODO' },
  { stage: 'quote', title: 'Send client quote', type: 'TODO' },
  { stage: 'quote', title: 'Send contract and deposit invoice', type: 'TODO' },
]

/** A short, formal note under each default task - what it is and when it is done (matched by title). */
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

/** Relative due date for each default enquiry task: days after the enquiry arrived. */
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

/** Reminder tone for a task's due date, relative to today. */
export type DueTone = 'overdue' | 'today' | 'soon' | null

export function dueToneFor(dueDate: Date | null, done: boolean, now: Date | null): DueTone {
  if (done || !dueDate || !now) return null
  // Sydney calendar days, not a rolling 24 hours: a task due at 08:00 today is "today" all day, and one
  // due tomorrow morning is not "today" this evening (the board, calendar and digest all read this).
  const diff = daysUntilSydney(dueDate, now)
  if (diff < 0) return 'overdue'
  if (diff === 0) return 'today'
  if (diff <= 3) return 'soon'
  return null
}

/** Which task must be done before another can start (a light dependency, matched by title). */
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
  /** Stored due fields (features/tasks/due): none, LEAD_CREATED + offset, FIXED day, or dueAt (timed). */
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
  /** The lead's owner (staff), shown uniformly per lead - mirrors the Jobs board's ownerName. */
  owner: string | null
}
export type EnqStage = {
  key: string
  label: string
  color: string
  active: boolean
  /** A per-lead custom stage (staff-added), so the UI can offer rename/delete on it. Core stages are false. */
  custom: boolean
  done: number
  total: number // money-ok: task count
  tasks: EnqTaskRow[]
}
export type EnquiryBoard = { stages: EnqStage[]; allDone: boolean }

/** The task's Sydney calendar date (YYYY-MM-DD) - the same day the label and the time field use. A UTC
 *  slice would show the previous day for any due time before 10/11am Sydney and shift it on every save. */
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
        // A booked enquiry shows the whole checklist ticked (forceAllDone): the sales phase is done, so
        // due dates and blockers are moot and hidden - it is a read-only record, not a live queue.
        const done = forceAllDone || t.status === 'COMPLETED'
        // The task's own stored due date (none / N days after the lead was created / a set day / a set
        // date + time) - never guessed from its title any more.
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
  // The "Now" stage is the earliest CORE stage with an unfinished task; custom stages never claim it.
  let activeKey: string | null = null
  for (const s of coreStages) {
    if (activeKey === null && s.tasks.some((t) => !t.done)) activeKey = s.key
  }
  for (const s of coreStages) s.active = s.key === activeKey

  // Per-lead custom stages: any non-core group present, appended after the core three (by first order).
  const firstOrder = new Map<string, number>()
  for (const t of tasks) {
    if (!t.stage || ENQUIRY_STAGE_KEYS.has(t.stage)) continue
    const prev = firstOrder.get(t.stage)
    if (prev === undefined || t.order < prev) firstOrder.set(t.stage, t.order)
  }
  const customStages = [...firstOrder.keys()]
    .sort((a, b) => firstOrder.get(a)! - firstOrder.get(b)! || a.localeCompare(b)) // name breaks ties: stable order
    .map((key) => toStage(key, key, 'enquiry', true))

  return { stages: [...coreStages, ...customStages], allDone: activeKey === null }
}
