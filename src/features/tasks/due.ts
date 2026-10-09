import { sydneyDateTimeParts, sydneyLocalToUtc } from '@/lib/time'

/**
 * When a workflow task is due - Studio Ninja's three choices (help.studioninja.co "Workflows"):
 * - none:     no due date, ticked when done, never flagged;
 * - relative: N days/weeks before/after a milestone (job: main shoot, job accepted; lead: lead created).
 *             It moves with the milestone (a new shoot date re-dates every shoot-anchored task);
 * - absolute: a set date, with an optional time ("Add time"). With a time it sits in that calendar slot.
 * Extra shoots and appointments are calendar items, so they always need a date AND a time.
 *
 * One parser for browser and server, one mapping to the stored WorkItem fields, and the reverse mapping
 * that pre-fills the edit form.
 */

export type DueMode = 'none' | 'relative' | 'absolute'
export type RelAnchor = 'BEFORE_SHOOT' | 'AFTER_SHOOT' | 'AFTER_JOB_ACCEPTED' | 'AFTER_LEAD_CREATED'
export type DueOption = { value: RelAnchor; label: string }

export const JOB_DUE_ANCHORS: DueOption[] = [
  { value: 'BEFORE_SHOOT', label: 'before main shoot' },
  { value: 'AFTER_SHOOT', label: 'after main shoot' },
  { value: 'AFTER_JOB_ACCEPTED', label: 'after job accepted' },
]
export const LEAD_DUE_ANCHORS: DueOption[] = [{ value: 'AFTER_LEAD_CREATED', label: 'after lead created' }]

export type TaskDue =
  | { kind: 'none' }
  | { kind: 'relative'; anchor: RelAnchor; days: number }
  | { kind: 'absolute'; date: string; time: string | null }

export type TaskFormErrors = { title?: string; amount?: string; date?: string; time?: string }

/** The stored WorkItem due fields (DueAnchor in the database). */
type StoredAnchor = 'SHOOT' | 'JOB_CONFIRMED' | 'FIXED' | 'LEAD_CREATED'
export type StoredDue = {
  dueAt?: Date | null
  dueOverrideAt?: Date | null
  dueAnchor: StoredAnchor | null
  dueOffsetDays: number
  dueDateFixed: Date | null
}

/** What the edit form opens with. `amount` + `unit` are the relative offset as staff typed it. */
export type DueSpec = {
  mode: DueMode
  anchor?: RelAnchor
  amount?: number
  unit?: 'days' | 'weeks'
  date?: string
  time?: string
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/
const MAX_DAYS = 730

function validDay(value: string): boolean {
  const m = DATE_RE.exec(value)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3])
}

/**
 * Read a task form (title, dueMode, dueAmount, dueUnit, dueAnchorRel, dueAt = date, dueTime). `calendarItem`
 * (an extra shoot or appointment) forces a date + time. `anchors` are the milestones this board offers.
 */
export function parseTaskForm(
  fd: FormData,
  opts: { anchors: readonly DueOption[]; calendarItem: boolean },
): { ok: true; title: string; due: TaskDue } | { ok: false; errors: TaskFormErrors } {
  const s = (k: string) => String(fd.get(k) ?? '').trim()
  const errors: TaskFormErrors = {}
  const title = s('title')
  if (!title) errors.title = 'Please enter a task name.'
  else if (title.length > 150) errors.title = 'Please keep the task name under 150 characters.'

  const mode: DueMode = opts.calendarItem ? 'absolute' : ((['none', 'relative', 'absolute'] as const).find((m) => m === s('dueMode')) ?? 'none')
  let due: TaskDue = { kind: 'none' }

  if (mode === 'relative') {
    const raw = s('dueAmount')
    const amount = Number(raw)
    const weeks = s('dueUnit') === 'weeks'
    const anchor = opts.anchors.find((a) => a.value === s('dueAnchorRel'))?.value
    if (!raw || !Number.isInteger(amount) || amount < 0) errors.amount = 'Please enter a whole number of days or weeks.'
    else if (amount * (weeks ? 7 : 1) > MAX_DAYS) errors.amount = 'Please keep it within two years.'
    else if (!anchor) errors.amount = 'Please choose what the due date counts from.'
    else due = { kind: 'relative', anchor, days: amount * (weeks ? 7 : 1) }
  } else if (mode === 'absolute') {
    const date = s('dueAt')
    const time = s('dueTime')
    if (!date) errors.date = 'Please choose a date.'
    else if (!validDay(date)) errors.date = 'Please enter a valid date.'
    if (opts.calendarItem && !time) errors.time = 'Please choose a time.'
    else if (time && !TIME_RE.test(time)) errors.time = 'Please enter a valid time.'
    if (!errors.date && !errors.time) due = { kind: 'absolute', date, time: time || null }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, title, due }
}

/** Accept the old call shape too: a Date is a set date + time, null is no due date. */
export function asTaskDue(x: TaskDue | Date | null): TaskDue {
  if (x === null) return { kind: 'none' }
  if (x instanceof Date) {
    const p = sydneyDateTimeParts(x)
    return { kind: 'absolute', date: p.date, time: p.time }
  }
  return x
}

/** Sydney wall-clock date + time as the stored instant. */
function atSydney(date: string, time: string): Date {
  return sydneyLocalToUtc(`${date}T${time.length === 5 ? `${time}:00` : time}`)
}

/** A bare day, stored the way @db.Date / dueDateFixed days are (UTC midnight, read as that Sydney day). */
function dayOnly(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`)
}

type ProjectDueUpdate = { dueAnchor?: StoredAnchor | null; dueOffsetDays?: number; dueDateFixed?: Date | null; dueOverrideAt: Date | null }
type LeadDueUpdate = { dueAt: Date | null; dueAnchor?: StoredAnchor | null; dueOffsetDays?: number; dueDateFixed?: Date | null }

/** WorkItem fields for a JOB task. A timed date is a manual override (dueOverrideAt, Rule D1): it wins
 *  while set and leaves the task's anchor underneath, so clearing it falls back to the anchor. */
export function projectDueData(due: TaskDue): ProjectDueUpdate {
  const empty = { dueAnchor: null, dueOffsetDays: 0, dueDateFixed: null, dueOverrideAt: null }
  if (due.kind === 'relative') {
    if (due.anchor === 'BEFORE_SHOOT') return { ...empty, dueAnchor: 'SHOOT', dueOffsetDays: -due.days }
    if (due.anchor === 'AFTER_SHOOT') return { ...empty, dueAnchor: 'SHOOT', dueOffsetDays: due.days }
    if (due.anchor === 'AFTER_JOB_ACCEPTED') return { ...empty, dueAnchor: 'JOB_CONFIRMED', dueOffsetDays: due.days }
    return empty
  }
  if (due.kind === 'absolute') {
    return due.time ? { dueOverrideAt: atSydney(due.date, due.time) } : { ...empty, dueAnchor: 'FIXED', dueDateFixed: dayOnly(due.date) }
  }
  return empty
}

/** WorkItem fields for a LEAD task. A timed date lives in dueAt and, like a job override, wins over the
 *  stored schedule underneath. */
export function leadDueData(due: TaskDue): LeadDueUpdate {
  const empty = { dueAt: null, dueAnchor: null, dueOffsetDays: 0, dueDateFixed: null }
  if (due.kind === 'relative' && due.anchor === 'AFTER_LEAD_CREATED') return { ...empty, dueAnchor: 'LEAD_CREATED', dueOffsetDays: due.days }
  if (due.kind === 'absolute') {
    return due.time ? { dueAt: atSydney(due.date, due.time) } : { ...empty, dueAnchor: 'FIXED', dueDateFixed: dayOnly(due.date) }
  }
  return empty
}

function relSpec(anchor: RelAnchor, days: number): DueSpec {
  const weeks = days >= 7 && days % 7 === 0
  return { mode: 'relative', anchor, amount: weeks ? days / 7 : days, unit: weeks ? 'weeks' : 'days' }
}

/** Types that are calendar items: always a date AND a time (the main shoot task included). */
export const CALENDAR_TASK_TYPES: ReadonlySet<string> = new Set(['EXTRA_SHOOT', 'APPOINTMENT', 'SHOOT'])

/** "+ Add task" on a job starts from a sensible due date for the stage, so staff rarely change it. */
export function defaultJobDue(stageKey: string): DueSpec {
  if (stageKey === 'preshoot') return { mode: 'relative', anchor: 'BEFORE_SHOOT', amount: 7, unit: 'days' }
  if (stageKey === 'shoot') return { mode: 'relative', anchor: 'AFTER_SHOOT', amount: 0, unit: 'days' }
  if (stageKey === 'editing' || stageKey === 'delivery') return { mode: 'relative', anchor: 'AFTER_SHOOT', amount: 7, unit: 'days' }
  return { mode: 'none' }
}

/** The edit form's starting point for a stored task (job or lead). */
export function dueSpecOf(w: StoredDue): DueSpec {
  const timed = w.dueOverrideAt ?? w.dueAt ?? null
  if (timed) {
    const p = sydneyDateTimeParts(timed)
    return { mode: 'absolute', date: p.date, time: p.time }
  }
  if (w.dueAnchor === 'FIXED' && w.dueDateFixed) return { mode: 'absolute', date: w.dueDateFixed.toISOString().slice(0, 10), time: '' }
  if (w.dueAnchor === 'SHOOT') return w.dueOffsetDays < 0 ? relSpec('BEFORE_SHOOT', -w.dueOffsetDays) : relSpec('AFTER_SHOOT', w.dueOffsetDays)
  if (w.dueAnchor === 'JOB_CONFIRMED') return relSpec('AFTER_JOB_ACCEPTED', w.dueOffsetDays)
  if (w.dueAnchor === 'LEAD_CREATED') return relSpec('AFTER_LEAD_CREATED', w.dueOffsetDays)
  return { mode: 'none' }
}

/** A LEAD task's due date and whether it has a time (a timed one sits in a calendar slot). */
export function leadTaskDue(w: StoredDue, leadCreatedAt: Date | null): { date: Date | null; timed: boolean } {
  if (w.dueAt) return { date: w.dueAt, timed: true }
  if (w.dueAnchor === 'FIXED') return { date: w.dueDateFixed, timed: false }
  if (w.dueAnchor === 'LEAD_CREATED' && leadCreatedAt) {
    const d = new Date(leadCreatedAt.getTime())
    d.setDate(d.getDate() + w.dueOffsetDays)
    return { date: d, timed: false }
  }
  return { date: null, timed: false }
}
