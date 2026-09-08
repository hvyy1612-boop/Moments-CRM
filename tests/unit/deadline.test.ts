import { describe, expect, it } from 'vitest'
import {
  dueToneFor,
  getTaskDueState,
  makeShootDateOf,
  resolveTaskDueDate,
  type BookingLike,
  type DeadlineContext,
  type DeadlineTask,
} from '@/lib/domain/deadline'

// AEST (UTC+10, no DST in June): 02:00Z == 12:00 Sydney the same calendar day. Using midday keeps the
// Sydney calendar date unambiguous.
const syd = (ymd: string) => new Date(`${ymd}T02:00:00Z`)

const task = (over: Partial<DeadlineTask>): DeadlineTask => ({
  dueAnchor: null,
  dueOffsetDays: 0,
  dueDateFixed: null,
  dueOverrideAt: null,
  bookingId: null,
  ...over,
})

const ctx = (over: Partial<DeadlineContext>): DeadlineContext => ({
  shootDateOf: () => null,
  jobConfirmedAt: null,
  ...over,
})

describe('resolveTaskDueDate (docs/25 Part 2)', () => {
  it('override wins over every anchor (Rule D1)', () => {
    const d = syd('2026-06-10')
    const r = resolveTaskDueDate(
      task({ dueOverrideAt: d, dueAnchor: 'SHOOT', dueOffsetDays: -3, bookingId: 'b1' }),
      ctx({ shootDateOf: () => syd('2026-06-20') }),
    )
    expect(r?.toISOString()).toBe(d.toISOString())
  })

  it('FIXED returns the fixed date', () => {
    const d = syd('2026-07-01')
    expect(resolveTaskDueDate(task({ dueAnchor: 'FIXED', dueDateFixed: d }), ctx({}))?.toISOString()).toBe(
      d.toISOString(),
    )
  })

  it('SHOOT adds the offset to the linked shoot date', () => {
    const shoot = syd('2026-06-20')
    const r = resolveTaskDueDate(
      task({ dueAnchor: 'SHOOT', dueOffsetDays: -3, bookingId: 'b1' }),
      ctx({ shootDateOf: (id) => (id === 'b1' ? shoot : null) }),
    )
    expect(r?.getUTCDate()).toBe(17) // 20 − 3
  })

  it('SHOOT with no shoot yet → null (undated until a shoot exists)', () => {
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
    expect(dueToneFor(syd('2026-06-18'), now)).toBe('SOON') // +3
    expect(dueToneFor(syd('2026-06-19'), now)).toBe('LATER') // +4
    expect(dueToneFor(null, now)).toBe('NONE')
  })

  it('getTaskDueState resolves then tones', () => {
    const s = getTaskDueState(
      task({ dueAnchor: 'SHOOT', dueOffsetDays: 0, bookingId: 'b1' }),
      ctx({ shootDateOf: () => syd('2026-06-15') }),
      now,
    )
    expect(s.tone).toBe('TODAY')
    expect(s.dueAt?.getUTCDate()).toBe(15)
  })
})

describe('makeShootDateOf (Rule D3/D5)', () => {
  const b = (over: Partial<BookingLike>): BookingLike => ({
    id: 'x',
    startsAt: syd('2026-06-20'),
    status: 'TENTATIVE',
    rescheduledFromId: null,
    ...over,
  })

  it('null returns the earliest active shoot (primary), not the latest', () => {
    const f = makeShootDateOf([
      b({ id: 'wed', startsAt: syd('2026-06-20') }),
      b({ id: 'eng', startsAt: syd('2026-05-01') }),
    ])
    expect(f(null)?.toISOString()).toBe(syd('2026-05-01').toISOString())
  })

  it('a linked task follows its own booking, not the primary', () => {
    const f = makeShootDateOf([
      b({ id: 'wed', startsAt: syd('2026-06-20') }),
      b({ id: 'eng', startsAt: syd('2026-05-01') }),
    ])
    expect(f('wed')?.toISOString()).toBe(syd('2026-06-20').toISOString())
  })

  it('a cancelled booking with an active successor resolves to the successor date (reschedule follows)', () => {
    const f = makeShootDateOf([
      b({ id: 'old', startsAt: syd('2026-06-20'), status: 'CANCELLED' }),
      b({ id: 'new', startsAt: syd('2026-07-04'), status: 'TENTATIVE', rescheduledFromId: 'old' }),
    ])
    expect(f('old')?.toISOString()).toBe(syd('2026-07-04').toISOString()) // old id → successor date
    expect(f('new')?.toISOString()).toBe(syd('2026-07-04').toISOString())
  })

  it('a cancelled booking with no successor resolves to null', () => {
    const f = makeShootDateOf([b({ id: 'old', status: 'CANCELLED' })])
    expect(f('old')).toBeNull()
    expect(f(null)).toBeNull()
  })
})
