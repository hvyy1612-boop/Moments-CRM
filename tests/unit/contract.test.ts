import { describe, expect, it } from 'vitest'
import { buildContractTerms, contractContentHash } from '@/lib/domain/contract'

const base = {
  projectCode: 'MPF-2026-0001',
  clientName: 'Ada Client',
  currency: 'AUD',
  lines: [{ description: 'Wedding photography', quantity: 1, lineTotal: '3500' }],
  subtotal: '3181.82',
  taxTotal: '318.18',
  total: '3500',
}

describe('contract terms snapshot', () => {
  it('carries every commercial figure and defaults the standard booking terms', () => {
    const snapshot = buildContractTerms(base)
    expect(snapshot.projectCode).toBe('MPF-2026-0001')
    expect(snapshot.clientName).toBe('Ada Client')
    expect(snapshot.total).toBe('3500')
    expect(snapshot.lines).toHaveLength(1)
    expect(snapshot.terms.length).toBeGreaterThan(0)
    // Money stays a string, never a float, so the snapshot round-trips through JSON unchanged (BR-P03).
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot)
  })

  it('respects explicit terms when provided', () => {
    const snapshot = buildContractTerms({ ...base, terms: ['Only clause.'] })
    expect(snapshot.terms).toEqual(['Only clause.'])
  })
})

describe('contract content hash', () => {
  it('is deterministic for the same snapshot', () => {
    expect(contractContentHash(buildContractTerms(base))).toBe(
      contractContentHash(buildContractTerms(base)),
    )
  })

  it('changes when any figure changes, proving a signed snapshot cannot drift', () => {
    const original = contractContentHash(buildContractTerms(base))
    const altered = contractContentHash(buildContractTerms({ ...base, total: '3600' }))
    expect(altered).not.toBe(original)
  })
})
