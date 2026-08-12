import { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { formatAud, isPriceOnEnquiry } from '@/lib/money'

const dec = (value: string) => new Prisma.Decimal(value)

describe('Australian currency formatting (§10.3)', () => {
  it('groups thousands and always shows two decimals', () => {
    expect(formatAud(dec('7850.00'))).toBe('$7,850.00')
    expect(formatAud(dec('850'))).toBe('$850.00')
    expect(formatAud(dec('1234567.5'))).toBe('$1,234,567.50')
    expect(formatAud(dec('0'))).toBe('$0.00')
  })

  it('puts the sign in front of the symbol, so a discount reads -$150.00', () => {
    // Regression: discount lines were rendering as "$-150.00" on the client quotation page while
    // the builder showed "-$150.00" for the same line.
    expect(formatAud(dec('-150.00'))).toBe('-$150.00')
    expect(formatAud(dec('-1234.5'))).toBe('-$1,234.50')
  })

  it('treats a zero price as "on enquiry", the placeholder convention (BR-X07)', () => {
    expect(isPriceOnEnquiry(dec('0.00'))).toBe(true)
    expect(isPriceOnEnquiry(dec('350.00'))).toBe(false)
  })
})
