import { describe, expect, it } from 'vitest'
import {
  JOB_DUE_ANCHORS,
  LEAD_DUE_ANCHORS,
  dueSpecOf,
  leadDueData,
  leadTaskDue,
  parseTaskForm,
  projectDueData,
} from '@/features/tasks/due'

function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}
const job = { anchors: JOB_DUE_ANCHORS, calendarItem: false }

describe('parseTaskForm', () => {
  it('a to-do with no due date is fine (Studio Ninja: tick it when done)', () => {
    const r = parseTaskForm(form({ title: 'Book a second shooter', dueMode: 'none' }), job)
    expect(r).toEqual({ ok: true, title: 'Book a second shooter', due: { kind: 'none' } })
  })

  it('reads a relative due date in days or weeks', () => {
    const days = parseTaskForm(form({ title: 'T', dueMode: 'relative', dueAmount: '10', dueUnit: 'days', dueAnchorRel: 'BEFORE_SHOOT' }), job)
    expect(days.ok && days.due).toEqual({ kind: 'relative', anchor: 'BEFORE_SHOOT', days: 10 })
    const weeks = parseTaskForm(form({ title: 'T', dueMode: 'relative', dueAmount: '2', dueUnit: 'weeks', dueAnchorRel: 'AFTER_SHOOT' }), job)
    expect(weeks.ok && weeks.due).toEqual({ kind: 'relative', anchor: 'AFTER_SHOOT', days: 14 })
  })

  it('refuses a milestone the board does not offer, and a bad amount', () => {
    const wrongAnchor = parseTaskForm(form({ title: 'T', dueMode: 'relative', dueAmount: '3', dueAnchorRel: 'AFTER_LEAD_CREATED' }), job)
    expect(!wrongAnchor.ok && wrongAnchor.errors.amount).toBeTruthy()
    const badAmount = parseTaskForm(form({ title: 'T', dueMode: 'relative', dueAmount: '1.5', dueAnchorRel: 'AFTER_SHOOT' }), job)
    expect(!badAmount.ok && badAmount.errors.amount).toBeTruthy()
  })

  it('an absolute date needs a valid day; the time is optional for a to-do', () => {
    const dateOnly = parseTaskForm(form({ title: 'T', dueMode: 'absolute', dueAt: '2027-03-14' }), job)
    expect(dateOnly.ok && dateOnly.due).toEqual({ kind: 'absolute', date: '2027-03-14', time: null })
    const noDate = parseTaskForm(form({ title: 'T', dueMode: 'absolute' }), job)
    expect(!noDate.ok && noDate.errors.date).toBeTruthy()
    const badDay = parseTaskForm(form({ title: 'T', dueMode: 'absolute', dueAt: '2027-02-30' }), job)
    expect(badDay.ok).toBe(false)
  })

  it('a calendar item (extra shoot, appointment) always needs a date and a time', () => {
    const cal = { anchors: JOB_DUE_ANCHORS, calendarItem: true }
    const missing = parseTaskForm(form({ title: 'Engagement shoot', dueMode: 'none', dueAt: '2027-03-14' }), cal)
    expect(!missing.ok && missing.errors.time).toBeTruthy()
    const ok = parseTaskForm(form({ title: 'Engagement shoot', dueAt: '2027-03-14', dueTime: '10:30' }), cal)
    expect(ok.ok && ok.due).toEqual({ kind: 'absolute', date: '2027-03-14', time: '10:30' })
  })

  it('needs a task name', () => {
    const r = parseTaskForm(form({ dueMode: 'none' }), job)
    expect(!r.ok && r.errors.title).toBeTruthy()
  })
})

describe('stored fields and back', () => {
  it('maps a job task due date onto anchors and an override', () => {
    expect(projectDueData({ kind: 'none' })).toEqual({ dueAnchor: null, dueOffsetDays: 0, dueDateFixed: null, dueOverrideAt: null })
    expect(projectDueData({ kind: 'relative', anchor: 'BEFORE_SHOOT', days: 7 })).toMatchObject({ dueAnchor: 'SHOOT', dueOffsetDays: -7 })
    expect(projectDueData({ kind: 'relative', anchor: 'AFTER_JOB_ACCEPTED', days: 4 })).toMatchObject({ dueAnchor: 'JOB_CONFIRMED', dueOffsetDays: 4 })
    const day = projectDueData({ kind: 'absolute', date: '2027-03-14', time: null })
    expect(day).toMatchObject({ dueAnchor: 'FIXED', dueOverrideAt: null })
    expect(day.dueDateFixed?.toISOString()).toBe('2027-03-14T00:00:00.000Z')
    const timed = projectDueData({ kind: 'absolute', date: '2027-03-14', time: '10:00' })
    expect('dueAnchor' in timed).toBe(false) // an override leaves the anchor underneath (Rule D1)
    expect(timed.dueOverrideAt?.toISOString()).toBe('2027-03-13T23:00:00.000Z') // 10am Sydney (AEDT)
  })

  it('maps a lead task due date, and reads every stored shape back for the edit form', () => {
    expect(leadDueData({ kind: 'relative', anchor: 'AFTER_LEAD_CREATED', days: 3 })).toMatchObject({ dueAnchor: 'LEAD_CREATED', dueOffsetDays: 3, dueAt: null })
    expect(dueSpecOf({ dueAnchor: 'SHOOT', dueOffsetDays: -14, dueDateFixed: null })).toEqual({ mode: 'relative', anchor: 'BEFORE_SHOOT', amount: 2, unit: 'weeks' })
    expect(dueSpecOf({ dueAnchor: 'SHOOT', dueOffsetDays: 3, dueDateFixed: null })).toEqual({ mode: 'relative', anchor: 'AFTER_SHOOT', amount: 3, unit: 'days' })
    expect(dueSpecOf({ dueAnchor: 'LEAD_CREATED', dueOffsetDays: 1, dueDateFixed: null })).toMatchObject({ anchor: 'AFTER_LEAD_CREATED', amount: 1 })
    expect(dueSpecOf({ dueAnchor: 'FIXED', dueOffsetDays: 0, dueDateFixed: new Date('2027-03-14T00:00:00Z') })).toEqual({ mode: 'absolute', date: '2027-03-14', time: '' })
    expect(dueSpecOf({ dueOverrideAt: new Date('2027-03-13T23:00:00Z'), dueAnchor: null, dueOffsetDays: 0, dueDateFixed: null })).toEqual({ mode: 'absolute', date: '2027-03-14', time: '10:00:00' })
    expect(dueSpecOf({ dueAnchor: null, dueOffsetDays: 0, dueDateFixed: null })).toEqual({ mode: 'none' })
  })

  it('resolves a lead task due date', () => {
    const created = new Date('2027-01-10T02:00:00Z')
    expect(leadTaskDue({ dueAnchor: 'LEAD_CREATED', dueOffsetDays: 3, dueDateFixed: null, dueAt: null }, created).date?.toISOString()).toBe('2027-01-13T02:00:00.000Z')
    expect(leadTaskDue({ dueAnchor: null, dueOffsetDays: 0, dueDateFixed: null, dueAt: null }, created)).toEqual({ date: null, timed: false })
    const at = new Date('2027-01-20T01:00:00Z')
    expect(leadTaskDue({ dueAnchor: null, dueOffsetDays: 0, dueDateFixed: null, dueAt: at }, created)).toEqual({ date: at, timed: true })
    expect(LEAD_DUE_ANCHORS.map((a) => a.value)).toEqual(['AFTER_LEAD_CREATED'])
  })
})
