import { describe, expect, it } from 'vitest'
import {
  clientSourceFromEnquiry,
  normalizePhone,
  rankPossibleMatches,
  type ClientMatch,
} from '@/lib/domain/enquiry-match'

describe('normalizePhone (dedup tier 2)', () => {
  it('reduces +61 / 0 / spaced forms of the same mobile to one key', () => {
    expect(normalizePhone('+61 412 345 678')).toBe('412345678')
    expect(normalizePhone('0412 345 678')).toBe('412345678')
    expect(normalizePhone('0412345678')).toBe('412345678')
    expect(normalizePhone('(04) 1234-5678')).toBe('412345678')
  })

  it('keeps distinct numbers distinct and handles empty input', () => {
    expect(normalizePhone('0412 345 679')).not.toBe(normalizePhone('0412 345 678'))
    expect(normalizePhone(null)).toBe('')
    expect(normalizePhone(undefined)).toBe('')
    expect(normalizePhone('')).toBe('')
  })
})

describe('clientSourceFromEnquiry', () => {
  it('carries referral and manual through; every other channel is ENQUIRY', () => {
    expect(clientSourceFromEnquiry('MANUAL')).toBe('MANUAL')
    expect(clientSourceFromEnquiry('WEBSITE')).toBe('ENQUIRY')
  })
})

describe('rankPossibleMatches (F-ENQ-05: suggest, never auto-merge)', () => {
  const c = (id: string, displayName: string, phone: string | null): ClientMatch => ({
    id,
    displayName,
    email: `${id}@example.test`,
    phone,
    status: 'PROSPECT',
  })
  const candidates = [
    c('1', 'Sarah Nguyen', '0412 345 678'), // matches name + phone
    c('2', 'Someone Else', '0400 000 000'), // no match
    c('3', 'SARAH NGUYEN', '0999 999 999'), // matches name only (case-insensitive)
    c('4', 'Different Name', '+61 412 345 678'), // matches phone only (normalised)
  ]

  it('matches on name (case-insensitive) or normalised phone, excludes non-matches', () => {
    const out = rankPossibleMatches(
      { name: 'sarah nguyen', phone: '+61 412 345 678' },
      candidates,
    ).map((m) => m.id)
    expect(out.sort()).toEqual(['1', '3', '4'])
    expect(out).not.toContain('2')
  })

  it('excludes the exact-email client and never returns duplicates', () => {
    const out = rankPossibleMatches({ name: 'sarah nguyen', phone: '0412345678' }, candidates, '1')
    expect(out.map((m) => m.id)).not.toContain('1')
    expect(new Set(out.map((m) => m.id)).size).toBe(out.length)
  })

  it('returns nothing when neither name nor phone is supplied', () => {
    expect(rankPossibleMatches({}, candidates)).toEqual([])
  })
})
