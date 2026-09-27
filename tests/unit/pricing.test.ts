import { describe, expect, it } from 'vitest'
import { computeQuoteTotals, computeDeposit, costPlusPrice } from '@/lib/domain/pricing'

describe('computeQuoteTotals — quote/estimate pricing (docs/30)', () => {
  it('sums lines and extracts GST via the ATO ÷11 method', () => {
    const t = computeQuoteTotals([{ unitPrice: '5000', quantity: 1 }])
    expect(t.total.toString()).toBe('5000')
    expect(t.gst.toString()).toBe('454.55')
    expect(t.exGst.toString()).toBe('4545.45')
    expect(t.discountTotal.toString()).toBe('0')
  })

  it('applies a per-line discount to the total (OpenStax Contemporary Mathematics §6.2)', () => {
    const t = computeQuoteTotals([{ unitPrice: '2000', quantity: 1, discount: '200' }])
    expect(t.grossSubtotal.toString()).toBe('2000')
    expect(t.discountTotal.toString()).toBe('200')
    expect(t.total.toString()).toBe('1800')
    expect(t.gst.toString()).toBe('163.64')
  })

  it('adds multiple lines with mixed discounts', () => {
    const t = computeQuoteTotals([
      { unitPrice: '1000', quantity: 2 },
      { unitPrice: '500', quantity: 1, discount: '100' },
    ])
    expect(t.grossSubtotal.toString()).toBe('2500')
    expect(t.discountTotal.toString()).toBe('100')
    expect(t.total.toString()).toBe('2400')
  })

  it('never lets a line go negative (discount larger than the line)', () => {
    const t = computeQuoteTotals([{ unitPrice: '100', quantity: 1, discount: '150' }])
    expect(t.total.toString()).toBe('0')
  })
})

describe('computeDeposit — studio-policy retainer split (docs/30)', () => {
  it('splits total into deposit and balance at the studio percentage', () => {
    const d = computeDeposit('5000', '30')
    expect(d.deposit.toString()).toBe('1500')
    expect(d.balance.toString()).toBe('3500')
  })

  it('rounds the deposit half-up to the cent', () => {
    const d = computeDeposit('1000', '33')
    expect(d.deposit.toString()).toBe('330')
    expect(d.balance.toString()).toBe('670')
  })

  it('rejects a percent outside 0–100', () => {
    expect(() => computeDeposit('1000', '150')).toThrow(/between 0 and 100/i)
    expect(() => computeDeposit('1000', '-5')).toThrow(/between 0 and 100/i)
  })

  it('0% and 100% are the boundary cases', () => {
    expect(computeDeposit('1000', '0').deposit.toString()).toBe('0')
    expect(computeDeposit('1000', '100').balance.toString()).toBe('0')
  })
})

describe('costPlusPrice — cost-based pricing (OpenStax Marketing §12.3 / PPA CODB, docs/30)', () => {
  it('price = cost × (1 + markup%)', () => {
    expect(costPlusPrice('1000', '50').toString()).toBe('1500')
    expect(costPlusPrice('800', '25').toString()).toBe('1000')
  })

  it('zero markup returns the cost', () => {
    expect(costPlusPrice('1234.5', '0').toString()).toBe('1234.5')
  })

  it('rejects negative cost or markup', () => {
    expect(() => costPlusPrice('-1', '10')).toThrow(/cost/i)
    expect(() => costPlusPrice('100', '-1')).toThrow(/markup/i)
  })
})
