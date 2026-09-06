import { describe, expect, it } from 'vitest'
import { deriveOpenStage } from '@/lib/domain/enquiry-stage'

const auto = { stage: 'enquiry', type: 'AUTO', status: 'COMPLETED' }
const enq = (status: string) => ({ stage: 'enquiry', type: 'TODO', status })
const quo = (status: string) => ({ stage: 'quote', type: 'TODO', status })

describe('deriveOpenStage - stage follows the workflow (docs/24)', () => {
  it('a fresh lead (only the auto row done) is NEW', () => {
    expect(deriveOpenStage([auto, enq('PENDING'), enq('PENDING'), quo('PENDING')])).toBe('NEW')
  })

  it('any enquiry-phase task done, still some pending -> CONTACTED', () => {
    expect(deriveOpenStage([auto, enq('COMPLETED'), enq('PENDING'), quo('PENDING')])).toBe('CONTACTED')
  })

  it('all enquiry-phase tasks done -> QUALIFIED (now in the quote phase)', () => {
    expect(deriveOpenStage([auto, enq('COMPLETED'), enq('COMPLETED'), quo('PENDING')])).toBe('QUALIFIED')
  })

  it('quote tasks also done stays QUALIFIED (Booked is explicit, never auto-derived)', () => {
    expect(deriveOpenStage([auto, enq('COMPLETED'), quo('COMPLETED')])).toBe('QUALIFIED')
  })

  it('count of tasks does not matter - one done enquiry task is enough for CONTACTED', () => {
    expect(deriveOpenStage([auto, enq('COMPLETED')])).toBe('QUALIFIED') // the only enquiry task is done
    expect(deriveOpenStage([auto, enq('COMPLETED'), enq('PENDING')])).toBe('CONTACTED')
  })
})
