import { describe, expect, it } from 'vitest'
import { deriveOpenStage } from '@/lib/domain/enquiry-stage'

const nw = (status: string) => ({ stage: 'new', type: 'TODO', status })
const disc = (status: string) => ({ stage: 'discussion', type: 'TODO', status })
const quo = (status: string) => ({ stage: 'quote', type: 'TODO', status })

describe('deriveOpenStage - stage follows the workflow, 3 groups (docs/24)', () => {
  it('a fresh lead (New group not done) is NEW', () => {
    expect(deriveOpenStage([nw('PENDING'), disc('PENDING'), quo('PENDING')])).toBe('NEW')
  })

  it('New group done, In discussion pending -> CONTACTED', () => {
    expect(deriveOpenStage([nw('COMPLETED'), disc('PENDING'), quo('PENDING')])).toBe('CONTACTED')
  })

  it('New + In discussion done, Quoting pending -> QUALIFIED', () => {
    expect(deriveOpenStage([nw('COMPLETED'), disc('COMPLETED'), quo('PENDING')])).toBe('QUALIFIED')
  })

  it('everything done stays QUALIFIED (Booked is an explicit Create Job)', () => {
    expect(deriveOpenStage([nw('COMPLETED'), disc('COMPLETED'), quo('COMPLETED')])).toBe('QUALIFIED')
  })

  it('empty groups are skipped', () => {
    // No New task at all; In discussion pending -> CONTACTED (not stuck at NEW).
    expect(deriveOpenStage([disc('PENDING'), quo('PENDING')])).toBe('CONTACTED')
  })

  it('count of tasks in a group does not matter', () => {
    expect(deriveOpenStage([nw('COMPLETED'), disc('COMPLETED'), disc('PENDING'), quo('PENDING')])).toBe('CONTACTED')
  })
})
