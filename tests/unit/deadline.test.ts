import { describe, expect, it } from 'vitest'
import {
  dueToneFor,
  getTaskDueState,
  jobShootDate,
  resolveTaskDueDate,
  type DeadlineContext,
  type DeadlineTask,
} from '@/lib/domain/deadline'

const syd = (ymd: string) => new Date(`${ymd}T02:00:00Z`)

const task = (over: Partial<DeadlineTask>): DeadlineTask => ({
  dueAnchor: null,
  dueOffsetDays: 0,
  dueDateFixed: null,
  dueOverrideAt: null,
  ...over,
})

const ctx = (over: Partial<DeadlineContext>): DeadlineContext => ({
  shootDate: null,
  jobConfirmedAt: null,
  ...over,
})

describe('resolveTaskDueDate (docs/25 Part 2)', () => {
  it('override wins over every anchor (Rule D1)', () => {
    const d = syd('2026-06-10')
    const r = resolveTaskDueDate(
      task({ dueOverrideAt: d, dueAnchor: 'SHOOT', dueOffsetDays: -3 }),
      ctx({ shootDate: syd('2026-06-20') }),
    )
    expect(r?.toISOString()).toBe(d.toISOString())
  })

  it('FIXED returns the fixed date', () => {
    const d = syd('2026-07-01')
    expect(resolveTaskDueDate(task({ dueAnchor: 'FIXED', dueDateFixed: d }), ctx({}))?.toISOString()).toBe(
      d.toISOString(),
    )
  })

  it("SHOOT adds the offset to the job's shoot date", () => {
    const r = resolveTaskDueDate(task({ dueAnchor: 'SHOOT', dueOffsetDays: -3 }), ctx({ shootDate: syd('2026-06-20') }))
    expect(r?.getUTCDate()).toBe(17)
  })

  it('SHOOT with no shoot date yet → null (undated until the job has one)', () => {
    expect(resolveTaskDueDate(task({ dueAnchor: 'SHOOT', dueOffsetDays: 1 }), ctx({}))).toBeNull()
  })

  it('JOB_CONFIRMED adds the offset to the confirm date; null when unconfirmed', () => {
    const confirmed = syd('2026-06-01')
    expect(
      resolveTaskDueDate(task({ dueAnchor: 'JOB_CONFIRMED', dueOffsetDays: 7 }), ctx({ jobConfirmedAt: confirmed }))
        ?.getUTCDate(),
    ).toBe(8)
    expect(resolveTaskDueDate(task({ dueAnchor: 'JOB_CONFIRMED', dueOffsetDays: 7 }), ctx({}))).toBeNull()
  })

  it('no anchor → null', () => {
    expect(resolveTaskDueDate(task({}), ctx({}))).toBeNull()
  })
})

describe('dueToneFor — Sydney day boundaries (Rule N9)', () => {
  const now = syd('2026-06-15')
  it('OVERDUE / TODAY / SOON / LATER / NONE', () => {
    expect(dueToneFor(syd('2026-06-14'), now)).toBe('OVERDUE')
    expect(dueToneFor(syd('2026-06-15'), now)).toBe('TODAY')
    expect(dueToneFor(syd('2026-06-18'), now)).toBe('SOON')
    expect(dueToneFor(syd('2026-06-19'), now)).toBe('LATER')
    expect(dueToneFor(null, now)).toBe('NONE')
  })

  it('getTaskDueState resolves then tones', () => {
    const s = getTaskDueState(
      task({ dueAnchor: 'SHOOT', dueOffsetDays: 0 }),
      ctx({ shootDate: syd('2026-06-15') }),
      now,
    )
    expect(s.tone).toBe('TODAY')
    expect(s.dueAt?.getUTCDate()).toBe(15)
  })
})

describe("jobShootDate - the job's shoot date", () => {
  const lead = syd('2026-11-14')
  it("is the lead's event date until staff set one", () => {
    expect(jobShootDate([{ type: 'SHOOT', status: 'PENDING', dueOverrideAt: null }], lead)?.toISOString()).toBe(lead.toISOString())
  })
  it('the date staff set on the Shoot task wins', () => {
    const set = syd('2026-11-21')
    expect(jobShootDate([{ type: 'TODO', status: 'PENDING', dueOverrideAt: syd('2026-01-01') }, { type: 'SHOOT', status: 'PENDING', dueOverrideAt: set }], lead)?.toISOString()).toBe(set.toISOString())
  })
  it('ignores a cancelled Shoot task, and is null with no date at all', () => {
    expect(jobShootDate([{ type: 'SHOOT', status: 'CANCELLED', dueOverrideAt: syd('2026-11-21') }], lead)?.toISOString()).toBe(lead.toISOString())
    expect(jobShootDate([], null)).toBeNull()
  })
})
