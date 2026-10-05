import { describe, expect, it } from 'vitest'
import { deriveOpenStage } from '@/lib/domain/enquiry-stage'

const nw = (status: string) => ({ stage: 'new', type: 'TODO', status })
const disc = (status: string) => ({ stage: 'discussion', type: 'TODO', status })
const quo = (status: string) => ({ stage: 'quote', type: 'TODO', status })

// The lead's three checklist groups (New enquiry / Contacted / Consultation) drive the three early stages.
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
    // No New enquiry task at all; Contacted pending -> CONTACTED (not stuck at NEW_ENQUIRY).
    expect(deriveOpenStage([disc('PENDING'), quo('PENDING')])).toBe('CONTACTED')
  })

  it('count of tasks in a group does not matter', () => {
    expect(deriveOpenStage([nw('COMPLETED'), disc('COMPLETED'), disc('PENDING'), quo('PENDING')])).toBe('CONTACTED')
  })
})

describe('lead board due dates use the Sydney calendar day (bug-scan 2026-10-05)', () => {
  it('a task due 09:00 Sydney keeps its own day in the edit form (was the previous UTC day)', async () => {
    const { buildEnquiryBoard } = await import('@/features/enquiries/workflow')
    const { sydneyLocalToUtc } = await import('@/lib/time')
    const dueAt = sydneyLocalToUtc('2026-10-10T09:00') // 2026-10-09T22:00Z
    const board = buildEnquiryBoard(
      [{ id: 't1', title: 'Send initial enquiry response', status: 'PENDING', stage: 'new', type: 'TODO', dueAt, order: 0, completedByName: null, completedAt: null }],
      (d) => d.toISOString(),
    )
    expect(board.stages.flatMap((s) => s.tasks)[0]?.dueValue).toBe('2026-10-10')
  })
})
