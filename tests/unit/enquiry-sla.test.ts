import { describe, expect, it } from 'vitest'
import { enquirySlaLevel, slaLabel } from '@/lib/domain/enquiry-sla'
import { LOST_REASONS, markLostSchema } from '@/lib/validation/enquiry-workflow'

const now = new Date('2026-08-12T09:00:00+10:00')
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000)

describe('enquiry response clock (BR-E07, BR-X02)', () => {
  it('BR-E07 a NEW enquiry inside 24 hours is within the commitment', () => {
    expect(enquirySlaLevel({ status: 'NEW', createdAt: hoursAgo(23) }, now)).toBe('within')
  })

  it('BR-E07 a NEW enquiry past 24 hours raises the dashboard alert', () => {
    expect(enquirySlaLevel({ status: 'NEW', createdAt: hoursAgo(25) }, now)).toBe('alert')
  })

  it('BR-E07 a NEW enquiry past 48 hours escalates', () => {
    expect(enquirySlaLevel({ status: 'NEW', createdAt: hoursAgo(49) }, now)).toBe('escalate')
  })

  it('BR-E07 exactly 24 hours has not yet breached, it must be MORE than 24', () => {
    expect(enquirySlaLevel({ status: 'NEW', createdAt: hoursAgo(24) }, now)).toBe('within')
  })

  it('BR-E07 only a NEW enquiry can breach, an answered one never does', () => {
    for (const status of ['CONTACTED', 'QUOTED', 'WON', 'LOST'] as const) {
      expect(enquirySlaLevel({ status, createdAt: hoursAgo(200) }, now)).toBe('within')
    }
  })

  it('BR-X02 counts elapsed calendar hours, so a weekend does not pause the clock', () => {

    const monday = new Date('2026-08-17T10:00:00+10:00')
    const saturday = new Date('2026-08-15T09:00:00+10:00')
    expect(enquirySlaLevel({ status: 'NEW', createdAt: saturday }, monday)).toBe('escalate')
  })

  it('§10.3 states the breach in words, not colour alone', () => {
    expect(slaLabel('escalate')).toBe('Overdue, past 48 hours')
    expect(slaLabel('alert')).toBe('Overdue, past 24 hours')
    expect(slaLabel('within')).toBeNull()
  })
})

describe('lost reason (BR-E10)', () => {
  it('BR-E10 accepts a reason from the fixed list', () => {
    expect(markLostSchema.safeParse({ reason: LOST_REASONS[0] }).success).toBe(true)
  })

  it('BR-E10 rejects free text, so the reason is always from the list', () => {
    expect(markLostSchema.safeParse({ reason: 'they ghosted us' }).success).toBe(false)
    expect(markLostSchema.safeParse({ reason: '' }).success).toBe(false)
    expect(markLostSchema.safeParse({}).success).toBe(false)
  })
})
