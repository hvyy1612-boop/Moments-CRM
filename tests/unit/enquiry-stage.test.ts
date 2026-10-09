import { describe, expect, it } from 'vitest'
import { deriveOpenStage } from '@/lib/domain/enquiry-stage'

const nw = (status: string) => ({ stage: 'new', type: 'TODO', status })
const disc = (status: string) => ({ stage: 'discussion', type: 'TODO', status })
const quo = (status: string) => ({ stage: 'quote', type: 'TODO', status })

// The lead's three checklist sections (New enquiry / Contacted / Consultation) drive the three early
// statuses: the status is the furthest section with a ticked task (owner, 2026-10-10).
describe('deriveOpenStage - the status shows the furthest section ticked inside', () => {
  it('a fresh lead (nothing ticked) is NEW_ENQUIRY', () => {
    expect(deriveOpenStage([nw('PENDING'), disc('PENDING'), quo('PENDING')])).toBe('NEW_ENQUIRY')
  })

  it('a tick in New enquiry keeps NEW_ENQUIRY; a tick in Contacted shows CONTACTED', () => {
    expect(deriveOpenStage([nw('COMPLETED'), disc('PENDING'), quo('PENDING')])).toBe('NEW_ENQUIRY')
    expect(deriveOpenStage([nw('COMPLETED'), disc('COMPLETED'), quo('PENDING')])).toBe('CONTACTED')
  })

  it('a tick in Consultation shows CONSULTATION even with earlier sections still open', () => {
    expect(deriveOpenStage([nw('PENDING'), disc('PENDING'), quo('COMPLETED')])).toBe('CONSULTATION')
    expect(deriveOpenStage([nw('COMPLETED'), disc('COMPLETED'), quo('COMPLETED')])).toBe('CONSULTATION')
  })

  it('one ticked task is enough; the rest of the section may still be open', () => {
    expect(deriveOpenStage([nw('PENDING'), disc('COMPLETED'), disc('PENDING'), quo('PENDING')])).toBe('CONTACTED')
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
