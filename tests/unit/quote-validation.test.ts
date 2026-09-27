import { describe, expect, it } from 'vitest'
import { saveQuoteSchema } from '@/lib/validation/quote'

const base = {
  lines: [{ description: 'Wedding package', quantity: 1, unitPrice: '3500' }],
  reference: 'Q-0005',
  issueDate: '2026-09-21',
}

describe('saveQuoteSchema — Quote ID + Issue Date required', () => {
  it('accepts a quote with reference + issue date', () => {
    expect(saveQuoteSchema.safeParse(base).success).toBe(true)
  })

  it('rejects a missing / empty Quote ID', () => {
    expect(saveQuoteSchema.safeParse({ ...base, reference: '' }).success).toBe(false)
    expect(saveQuoteSchema.safeParse({ ...base, reference: '   ' }).success).toBe(false)
    const r = saveQuoteSchema.safeParse({ lines: base.lines, issueDate: base.issueDate })
    expect(r.success).toBe(false)
  })

  it('rejects a missing / empty Issue Date', () => {
    expect(saveQuoteSchema.safeParse({ ...base, issueDate: '' }).success).toBe(false)
    const r = saveQuoteSchema.safeParse({ lines: base.lines, reference: base.reference })
    expect(r.success).toBe(false)
  })
})
