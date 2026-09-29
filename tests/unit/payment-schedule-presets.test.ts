import { describe, it, expect } from 'vitest'
import { formatScheduleDate, presetRows } from '@/features/finance/payment-schedule'

const cents = (rows: { amount: string }[]) => rows.reduce((s, r) => s + Math.round(Number(r.amount) * 100), 0)

describe('payment schedule presets', () => {
  it('always adds up to the invoice total to the cent (the server rejects any mismatch)', () => {
    for (const total of [0.01, 3725.01, 6800, 7450, 1234.57, 99999.99]) {
      for (const key of ['D25_B75_SHOOT14', 'D50_B50_30D', 'D50_B50_SHOOT', 'DUE7', 'DUE_ON_ISSUE'] as const) {
        const rows = presetRows(key, total, '2026-09-29', '2027-06-12')!
        expect(cents(rows)).toBe(Math.round(total * 100))
      }
    }
  })

  it('splits 25 / 75 with the balance due 14 days before the shoot', () => {
    expect(presetRows('D25_B75_SHOOT14', 8000, '2026-09-29', '2027-06-12')).toEqual([
      { label: 'Deposit (25%)', dueAt: '2026-09-29', amount: '2000.00' },
      { label: 'Balance (75%)', dueAt: '2027-05-29', amount: '6000.00' },
    ])
  })

  it('never makes a balance due before the invoice is issued', () => {
    // Shoot in 5 days: "14 days before" would be in the past, so it falls due on the issue date.
    const rows = presetRows('D25_B75_SHOOT14', 1000, '2026-09-29', '2026-10-04')!
    expect(rows[1]!.dueAt).toBe('2026-09-29')
  })

  it('dates 50 / 50 in 30 days and Due in 7 Days across month ends', () => {
    expect(presetRows('D50_B50_30D', 100, '2026-09-29', null)![1]!.dueAt).toBe('2026-10-29')
    expect(presetRows('DUE7', 100, '2026-09-29', null)).toEqual([{ label: 'Full payment', dueAt: '2026-10-06', amount: '100.00' }])
    expect(presetRows('DUE_ON_ISSUE', 100, '2026-09-29', null)![0]!.dueAt).toBe('2026-09-29')
  })

  it('shows due dates as a readable calendar date, whatever the viewer timezone', () => {
    expect(formatScheduleDate('2026-10-29')).toBe('29 Oct 2026')
    expect(formatScheduleDate('2027-01-01')).toBe('01 Jan 2027')
  })

  it('cannot be calculated for a $0 total (no issue-less or zero schedules)', () => {
    expect(presetRows('D50_B50_30D', 0, '2026-09-29', null)).toBeNull()
    expect(presetRows('DUE7', 0, '2026-09-29', null)).toBeNull()
  })

  it('still lets a shoot-based preset be chosen with no shoot date, leaving the balance date blank', () => {
    // The deposit is dated on issue; the shoot-relative balance is left blank (stored as null, set later),
    // and the two still add up to the total exactly.
    expect(presetRows('D50_B50_SHOOT', 500, '2026-09-29', null)).toEqual([
      { label: 'Deposit (50%)', dueAt: '2026-09-29', amount: '250.00' },
      { label: 'Balance (50%)', dueAt: '', amount: '250.00' },
    ])
    expect(presetRows('D25_B75_SHOOT14', 500, '2026-09-29', null)).toEqual([
      { label: 'Deposit (25%)', dueAt: '2026-09-29', amount: '125.00' },
      { label: 'Balance (75%)', dueAt: '', amount: '375.00' },
    ])
  })
})
