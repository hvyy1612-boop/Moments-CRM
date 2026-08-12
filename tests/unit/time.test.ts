import { describe, it, expect } from 'vitest'
import { daysUntil, formatSydneyDate, isPeakSeason } from '@/lib/time'

describe('Sydney time helpers (BR-X01, BR-X05)', () => {
  it('BR-X05 counts a late-March shoot as peak season in Sydney', () => {
    expect(isPeakSeason(new Date('2027-03-31T00:00:00+11:00'))).toBe(true)
  })

  it('BR-X05 counts the whole of November as peak season', () => {
    expect(isPeakSeason(new Date('2027-11-30T12:00:00+11:00'))).toBe(true)
  })

  it('BR-X05 counts June as off peak', () => {
    expect(isPeakSeason(new Date('2027-06-15T12:00:00+10:00'))).toBe(false)
  })

  it('formats and shifts a UTC instant into the Sydney calendar day', () => {

    const out = formatSydneyDate(new Date('2027-03-13T14:00:00Z'))
    expect(out).toMatch(/^\d{2} \w{3} \d{4}$/)
    expect(out).toContain('14')
    expect(out).toContain('Mar')
  })

  it('measures whole days between two instants', () => {
    const from = new Date('2027-01-01T00:00:00Z')
    const to = new Date('2027-01-08T00:00:00Z')
    expect(daysUntil(to, from)).toBe(7)
  })
})
