import { describe, expect, it } from 'vitest'
import { computeQuoteTotals, computeDeposit } from '@/lib/domain/pricing'
import { estimateTotals, estimateDeposit, toCents, formatCents } from '@/lib/pricing-estimate'

const CASES: { unitPrice: string; quantity: number; discount?: string }[][] = [
  [{ unitPrice: '3500', quantity: 1 }, { unitPrice: '450', quantity: 1, discount: '200' }],
  [{ unitPrice: '5000', quantity: 1 }],
  [{ unitPrice: '2000', quantity: 1, discount: '200' }],
  [{ unitPrice: '1000', quantity: 2 }, { unitPrice: '500', quantity: 1, discount: '100' }],
  [{ unitPrice: '100', quantity: 1, discount: '150' }], // discount larger than line → floored at 0
  [{ unitPrice: '6800', quantity: 1 }, { unitPrice: '299.99', quantity: 3 }],
  [{ unitPrice: '150', quantity: 7 }],
]

describe('pricing-estimate mirrors pricing.ts (docs/30)', () => {
  it('totals match the Decimal module to the cent', () => {
    for (const order of CASES) {
      const decimal = computeQuoteTotals(order)
      const cents = estimateTotals(order.map((l) => ({ unitPriceCents: toCents(l.unitPrice), quantity: l.quantity, discountCents: l.discount ? toCents(l.discount) : 0 })))
      expect((cents.totalCents / 100).toFixed(2)).toBe(decimal.total.toFixed(2))
      expect((cents.gstCents / 100).toFixed(2)).toBe(decimal.gst.toFixed(2))
      expect((cents.exGstCents / 100).toFixed(2)).toBe(decimal.exGst.toFixed(2))
      expect((cents.grossCents / 100).toFixed(2)).toBe(decimal.grossSubtotal.toFixed(2))
      expect((cents.discountCents / 100).toFixed(2)).toBe(decimal.discountTotal.toFixed(2))
    }
  })

  it('deposit split matches the Decimal module to the cent', () => {
    for (const pct of [0, 25, 30, 33, 50, 100]) {
      const decimal = computeDeposit('3750', String(pct))
      const cents = estimateDeposit(375000, pct)
      expect((cents.depositCents / 100).toFixed(2)).toBe(decimal.deposit.toFixed(2))
      expect((cents.balanceCents / 100).toFixed(2)).toBe(decimal.balance.toFixed(2))
    }
  })

  it('rejects a percent outside 0–100', () => {
    expect(() => estimateDeposit(100000, 150)).toThrow(/between 0 and 100/i)
    expect(() => estimateDeposit(100000, -5)).toThrow(/between 0 and 100/i)
  })

  it('toCents / formatCents round-trip', () => {
    expect(toCents('3,500.50')).toBe(350050)
    expect(toCents('')).toBe(0)
    expect(formatCents(375000)).toBe('$3,750.00')
    expect(formatCents(34091)).toBe('$340.91')
  })
})
