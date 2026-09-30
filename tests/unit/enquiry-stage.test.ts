import { describe, expect, it } from 'vitest'
import { deriveOpenStage } from '@/lib/domain/enquiry-stage'

const nw = (status: string) => ({ stage: 'new', type: 'TODO', status })
const disc = (status: string) => ({ stage: 'discussion', type: 'TODO', status })
const quo = (status: string) => ({ stage: 'quote', type: 'TODO', status })

describe('deriveOpenStage - stage follows the workflow, 3 groups (docs/24)', () => {
  it('a fresh lead (New enquiry group not done) is NEW_ENQUIRY', () => {
    expect(deriveOpenStage([nw('PENDING'), disc('PENDING'), quo('PENDING')])).toBe('NEW_ENQUIRY')
  })

  it('New enquiry group done, Contacted pending -> CONTACTED', () => {
    expect(deriveOpenStage([nw('COMPLETED'), disc('PENDING'), quo('PENDING')])).toBe('CONTACTED')
  })

  it('New enquiry + Contacted done, Consultation pending -> CONSULTATION', () => {
    expect(deriveOpenStage([nw('COMPLETED'), disc('COMPLETED'), quo('PENDING')])).toBe('CONSULTATION')
  })

  it('everything done stays CONSULTATION (later stages come from real events, not ticks)', () => {
    expect(deriveOpenStage([nw('COMPLETED'), disc('COMPLETED'), quo('COMPLETED')])).toBe('CONSULTATION')
  })

  it('empty groups are skipped', () => {

    expect(deriveOpenStage([disc('PENDING'), quo('PENDING')])).toBe('CONTACTED')
  })

  it('count of tasks in a group does not matter', () => {
    expect(deriveOpenStage([nw('COMPLETED'), disc('COMPLETED'), disc('PENDING'), quo('PENDING')])).toBe('CONTACTED')
  })
})
