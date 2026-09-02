import { describe, expect, it } from 'vitest'
import { centsToAmount, computeAmountsCents, isFullyAllocated, sumPercents, toCents } from '@/lib/finance/instalments'

describe('instalment engine', () => {
  it('splits $3,500 as 10 / 50 / 40 into 350 / 1750 / 1400', () => {
    const cents = computeAmountsCents(toCents('3500'), [10, 50, 40])
    expect(cents).toEqual([35000, 175000, 140000])
    expect(cents.map(centsToAmount)).toEqual(['350.00', '1750.00', '1400.00'])
  })

  it('splits $100 as 33.33 / 33.33 / 33.34 and still totals exactly $100', () => {
    const cents = computeAmountsCents(toCents('100'), [33.33, 33.33, 33.34])
    expect(cents).toEqual([3333, 3333, 3334])
    expect(cents.reduce((s, c) => s + c, 0)).toBe(10000)
  })

  it('final instalment absorbs the rounding remainder (sum always equals total)', () => {
    for (const schedule of [[33.33, 33.33, 33.34], [16.67, 16.67, 16.66, 50], [5, 45, 50], [25, 25, 25, 25]]) {
      const total = toCents('999.99')
      const cents = computeAmountsCents(total, schedule)
      expect(cents.reduce((s, c) => s + c, 0)).toBe(total)
    }
  })

  it('supports arbitrary valid schedules, not a fixed set', () => {
    expect(computeAmountsCents(toCents('4000'), [20, 30, 50])).toEqual([80000, 120000, 200000])
    expect(computeAmountsCents(toCents('1000'), [10, 20, 30, 40])).toEqual([10000, 20000, 30000, 40000])
  })

  it('recalculates when the invoice total changes', () => {
    expect(computeAmountsCents(toCents('3500'), [10, 50, 40])).toEqual([35000, 175000, 140000])
    expect(computeAmountsCents(toCents('4000'), [10, 50, 40])).toEqual([40000, 200000, 160000])
  })

  it('detects under- and over-allocation', () => {
    expect(sumPercents([10, 50, 30])).toBe(90)
    expect(isFullyAllocated([10, 50, 30])).toBe(false)
    expect(sumPercents([10, 50, 50])).toBe(110)
    expect(isFullyAllocated([10, 50, 50])).toBe(false)
    expect(isFullyAllocated([10, 50, 40])).toBe(true)
    expect(isFullyAllocated([33.33, 33.33, 33.34])).toBe(true)
  })
})
