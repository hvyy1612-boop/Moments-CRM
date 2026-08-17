import { describe, expect, it } from 'vitest'
import { rangesOverlap, sydneyLocalToUtc } from '@/lib/time'

describe('Sydney wall time to UTC (daylight saving aware)', () => {
  it('reads a summer time as AEDT (+11)', () => {
    // 14 Nov is inside Sydney daylight saving, so 2pm local is 03:00 UTC.
    expect(sydneyLocalToUtc('2026-11-14T14:00').toISOString()).toBe('2026-11-14T03:00:00.000Z')
  })

  it('reads a winter time as AEST (+10)', () => {
    // 14 Jul is standard time, so 2pm local is 04:00 UTC.
    expect(sydneyLocalToUtc('2026-07-14T14:00').toISOString()).toBe('2026-07-14T04:00:00.000Z')
  })
})

describe('half-open range overlap', () => {
  const d = (iso: string) => new Date(iso)

  it('detects a genuine overlap', () => {
    expect(
      rangesOverlap(
        d('2026-11-14T03:00:00Z'),
        d('2026-11-14T07:00:00Z'),
        d('2026-11-14T05:00:00Z'),
        d('2026-11-14T09:00:00Z'),
      ),
    ).toBe(true)
  })

  it('treats touching ranges as non-overlapping (one ends when the next begins)', () => {
    expect(
      rangesOverlap(
        d('2026-11-14T03:00:00Z'),
        d('2026-11-14T05:00:00Z'),
        d('2026-11-14T05:00:00Z'),
        d('2026-11-14T07:00:00Z'),
      ),
    ).toBe(false)
  })

  it('returns false for disjoint ranges', () => {
    expect(
      rangesOverlap(
        d('2026-11-14T03:00:00Z'),
        d('2026-11-14T04:00:00Z'),
        d('2026-11-14T06:00:00Z'),
        d('2026-11-14T07:00:00Z'),
      ),
    ).toBe(false)
  })
})
