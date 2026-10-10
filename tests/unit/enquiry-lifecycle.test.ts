import { describe, it, expect } from 'vitest'
import { deriveOpenStage, OPEN_STAGE_ORDER } from '@/lib/domain/enquiry-stage'
import { ENQUIRY_STAGE_LABEL, ENQUIRY_STAGE_TABS, STAGE_ORDER, isOpenEnquiry, leadDisplayStatus } from '@/features/enquiries/status'

const task = (stage: string, status = 'PENDING', type = 'STANDARD') => ({ stage, status, type })

describe('enquiry sales lifecycle', () => {
  it('exposes exactly the seven stored stages, in lifecycle order, plus the display-only Job complete', () => {
    expect(Object.keys(ENQUIRY_STAGE_LABEL)).toEqual([
      'NEW_ENQUIRY',
      'CONTACTED',
      'CONSULTATION',
      'QUOTE_SENT',
      'AWAITING_BOOKING_CONFIRMATION',
      'BOOKING_CONFIRMED',
      'DECLINED',
      'JOB_COMPLETE', // not a DB value: "Job complete" ticked on the lead (leadDisplayStatus)
    ])
  })

  it('uses business-meaning labels, not technical codes (spec §18)', () => {
    expect(ENQUIRY_STAGE_LABEL.NEW_ENQUIRY).toBe('New enquiry')
    expect(ENQUIRY_STAGE_LABEL.QUOTE_SENT).toBe('Quote sent')
    expect(ENQUIRY_STAGE_LABEL.AWAITING_BOOKING_CONFIRMATION).toBe('Awaiting booking confirmation')
    expect(ENQUIRY_STAGE_LABEL.BOOKING_CONFIRMED).toBe('Booking confirmed')
    expect(ENQUIRY_STAGE_LABEL.DECLINED).toBe('Archived')

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

  it('offers one filter tab per lead stage + Job complete + Archived; a booked lead is a job, not listed', () => {
    expect(ENQUIRY_STAGE_TABS.map((t) => t.key)).toEqual([...STAGE_ORDER.filter((s) => s !== 'BOOKING_CONFIRMED'), 'JOB_COMPLETE', 'DECLINED'])
  })

  it('shows "Job complete" once it is ticked on the lead, except for an archived or booked lead', () => {
    const at = new Date()
    expect(leadDisplayStatus('CONSULTATION', at)).toBe('JOB_COMPLETE')
    expect(ENQUIRY_STAGE_LABEL[leadDisplayStatus('CONSULTATION', at)]).toBe('Job complete')
    expect(leadDisplayStatus('CONSULTATION', null)).toBe('CONSULTATION')
    expect(leadDisplayStatus('DECLINED', at)).toBe('DECLINED')
    expect(leadDisplayStatus('BOOKING_CONFIRMED', at)).toBe('BOOKING_CONFIRMED')
  })

  it('only the three early stages are derived from the checklist; later stages are event-driven', () => {
    expect(OPEN_STAGE_ORDER).toEqual(['NEW_ENQUIRY', 'CONTACTED', 'CONSULTATION'])
  })

  it('shows the furthest section with a ticked task, whatever is ticked before it', () => {

    expect(deriveOpenStage([task('new'), task('discussion'), task('quote')])).toBe('NEW_ENQUIRY')
    expect(deriveOpenStage([])).toBe('NEW_ENQUIRY')

    expect(deriveOpenStage([task('new', 'COMPLETED'), task('discussion'), task('quote')])).toBe('NEW_ENQUIRY')
    expect(deriveOpenStage([task('new'), task('discussion', 'COMPLETED'), task('quote')])).toBe('CONTACTED')

    expect(deriveOpenStage([task('new'), task('discussion'), task('quote', 'COMPLETED')])).toBe('CONSULTATION')

    expect(deriveOpenStage([{ stage: 'quote', status: 'COMPLETED', type: 'AUTO' }])).toBe('NEW_ENQUIRY')
  })
})
