import { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { splitGstInclusive } from '@/lib/money'

const dec = (value: string) => new Prisma.Decimal(value)

describe('GST-inclusive split (BR-P01/P02)', () => {
  it('takes GST as one eleventh of the total, rounded half up', () => {
    const { subtotal, taxTotal } = splitGstInclusive(dec('700'))
    expect(taxTotal.toFixed(2)).toBe('63.64')
    expect(subtotal.toFixed(2)).toBe('636.36')
  })

  it('always reconciles: subtotal + GST equals the total', () => {
    for (const total of ['1000', '3500', '1234.55', '0.11']) {
      const { subtotal, taxTotal } = splitGstInclusive(dec(total))
      expect(subtotal.add(taxTotal).toFixed(2)).toBe(dec(total).toFixed(2))
    }
  })
})
