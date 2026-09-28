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
    expect(ENQUIRY_STAGE_LABEL.DECLINED).toBe('Declined')
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

  it('offers All + one filter tab per stage', () => {
    expect(ENQUIRY_STAGE_TABS.map((t) => t.key)).toEqual([...STAGE_ORDER, 'DECLINED'])
  })

  it('only the three early stages are derived from the checklist; later stages are event-driven', () => {
    expect(OPEN_STAGE_ORDER).toEqual(['NEW_ENQUIRY', 'CONTACTED', 'CONSULTATION'])
  })

  it('derives the early stage from the earliest incomplete task group', () => {
    // An incomplete "new" task keeps the lead at New enquiry.
    expect(deriveOpenStage([task('new'), task('discussion'), task('quote')])).toBe('NEW_ENQUIRY')
    // New done, discussion pending -> Contacted.
    expect(deriveOpenStage([task('new', 'COMPLETED'), task('discussion'), task('quote')])).toBe('CONTACTED')
    // New + discussion done, quote-prep pending -> Consultation.
    expect(deriveOpenStage([task('new', 'COMPLETED'), task('discussion', 'COMPLETED'), task('quote')])).toBe('CONSULTATION')
    // Everything done still sits at Consultation - moving to Quote sent is an explicit send event.
    expect(deriveOpenStage([task('new', 'COMPLETED'), task('discussion', 'COMPLETED'), task('quote', 'COMPLETED')])).toBe('CONSULTATION')
    // Empty checklist -> Consultation fallback.
    expect(deriveOpenStage([])).toBe('CONSULTATION')
  })
})
