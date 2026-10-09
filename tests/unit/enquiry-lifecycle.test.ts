import { describe, it, expect } from 'vitest'
import { deriveOpenStage, OPEN_STAGE_ORDER } from '@/lib/domain/enquiry-stage'
import { ENQUIRY_STAGE_LABEL, ENQUIRY_STAGE_TABS, STAGE_ORDER, isOpenEnquiry } from '@/features/enquiries/status'

const task = (stage: string, status = 'PENDING', type = 'STANDARD') => ({ stage, status, type })

describe('enquiry sales lifecycle', () => {
  it('exposes exactly the seven staff-facing stages, in lifecycle order', () => {
    expect(Object.keys(ENQUIRY_STAGE_LABEL)).toEqual([
      'NEW_ENQUIRY',
      'CONTACTED',
      'CONSULTATION',
      'QUOTE_SENT',
      'AWAITING_BOOKING_CONFIRMATION',
      'BOOKING_CONFIRMED',
      'DECLINED',
    ])
  })

  it('uses business-meaning labels, not technical codes (spec §18)', () => {
    expect(ENQUIRY_STAGE_LABEL.NEW_ENQUIRY).toBe('New enquiry')
    expect(ENQUIRY_STAGE_LABEL.QUOTE_SENT).toBe('Quote sent')
    expect(ENQUIRY_STAGE_LABEL.AWAITING_BOOKING_CONFIRMATION).toBe('Awaiting booking confirmation')
    expect(ENQUIRY_STAGE_LABEL.BOOKING_CONFIRMED).toBe('Booking confirmed')
    expect(ENQUIRY_STAGE_LABEL.DECLINED).toBe('Archived') // Studio Ninja's word; the DB value stays DECLINED
    // The retired technical vocabulary must be gone.
    expect(Object.values(ENQUIRY_STAGE_LABEL)).not.toContain('Booked')
    expect(Object.values(ENQUIRY_STAGE_LABEL)).not.toContain('Quoting')
    expect(Object.values(ENQUIRY_STAGE_LABEL)).not.toContain('Cancelled')
  })

  it('treats everything before Booking confirmed (and not Declined) as an open lead', () => {
    for (const s of ['NEW_ENQUIRY', 'CONTACTED', 'CONSULTATION', 'QUOTE_SENT', 'AWAITING_BOOKING_CONFIRMATION']) {
      expect(isOpenEnquiry(s)).toBe(true)
    }
    expect(isOpenEnquiry('BOOKING_CONFIRMED')).toBe(false)
    expect(isOpenEnquiry('DECLINED')).toBe(false)
  })

  it('offers one filter tab per lead stage + Archived; a booked lead is a job, not listed in Leads', () => {
    expect(ENQUIRY_STAGE_TABS.map((t) => t.key)).toEqual([...STAGE_ORDER.filter((s) => s !== 'BOOKING_CONFIRMED'), 'DECLINED'])
  })

  it('only the three early stages are derived from the checklist; later stages are event-driven', () => {
    expect(OPEN_STAGE_ORDER).toEqual(['NEW_ENQUIRY', 'CONTACTED', 'CONSULTATION'])
  })

  it('shows the furthest section with a ticked task, whatever is ticked before it', () => {
    // Nothing ticked -> New enquiry.
    expect(deriveOpenStage([task('new'), task('discussion'), task('quote')])).toBe('NEW_ENQUIRY')
    expect(deriveOpenStage([])).toBe('NEW_ENQUIRY')
    // A tick in New enquiry stays New enquiry; a tick in Contacted shows Contacted.
    expect(deriveOpenStage([task('new', 'COMPLETED'), task('discussion'), task('quote')])).toBe('NEW_ENQUIRY')
    expect(deriveOpenStage([task('new'), task('discussion', 'COMPLETED'), task('quote')])).toBe('CONTACTED')
    // A tick in Consultation shows Consultation even with earlier sections still open (owner, 2026-10-10).
    expect(deriveOpenStage([task('new'), task('discussion'), task('quote', 'COMPLETED')])).toBe('CONSULTATION')
    // An Auto row never counts.
    expect(deriveOpenStage([{ stage: 'quote', status: 'COMPLETED', type: 'AUTO' }])).toBe('NEW_ENQUIRY')
  })
})
