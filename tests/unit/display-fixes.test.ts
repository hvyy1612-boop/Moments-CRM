import { describe, expect, it } from 'vitest'
import { Prisma } from '@prisma/client'
import { dueToneFor } from '@/features/enquiries/workflow'
import { getInvoiceBalance, nextPaymentDue, type InvoiceMoneyInput } from '@/lib/domain/money'
import { quoteValidityPassed } from '@/lib/domain/quote'

/** Bug-scan 2026-10-05 (C): dates and figures that read wrong on screen. */

const d = (n: number) => new Prisma.Decimal(n)
const charge = (amount: number) => ({ type: 'CHARGE' as const, status: 'SUCCEEDED' as const, amount: d(amount) })
const invoice = (p: Partial<InvoiceMoneyInput>): InvoiceMoneyInput => ({ status: 'ISSUED', total: d(0), dueAt: null, instalments: [], transactions: [], creditNotes: [], ...p })

describe('a quote is valid through its whole "valid until" day (Sydney)', () => {
  const validUntil = new Date('2026-10-10') // how the form stores it: UTC midnight = 11:00 Sydney
  it('still valid in the afternoon of that day', () => {
    expect(quoteValidityPassed(validUntil, new Date('2026-10-10T05:00:00Z'))).toBe(false) // 16:00 Sydney
  })
  it('lapses once the day is over', () => {
    expect(quoteValidityPassed(validUntil, new Date('2026-10-10T13:30:00Z'))).toBe(true) // 00:30 next day
  })
  it('no date never lapses', () => {
    expect(quoteValidityPassed(null, new Date())).toBe(false)
  })
})

describe('task due tones use Sydney calendar days', () => {
  it('a task due at 08:00 today is "today" at 09:30, not overdue', () => {
    expect(dueToneFor(new Date('2026-10-10T21:00:00Z'), false, new Date('2026-10-10T22:30:00Z'))).toBe('today')
  })
  it('a task due 07:00 tomorrow is not "today" this evening', () => {
    expect(dueToneFor(new Date('2026-10-11T20:00:00Z'), false, new Date('2026-10-11T09:00:00Z'))).toBe('soon') // 20:00 vs 07:00 next day
  })
  it('yesterday is overdue', () => {
    expect(dueToneFor(new Date('2026-10-09T03:00:00Z'), false, new Date('2026-10-10T03:00:00Z'))).toBe('overdue')
  })
})

describe('an invoice is dated by its next payment due', () => {
  const deposit = { label: 'Deposit', dueAt: new Date('2026-09-30T14:00:00Z'), amount: d(1000), sortOrder: 0 }
  const final = { label: 'Final payment', dueAt: new Date('2027-01-31T13:00:00Z'), amount: d(3000), sortOrder: 1 }
  it('an unpaid deposit is the next payment due, not the final payment', () => {
    const bal = getInvoiceBalance(invoice({ total: d(4000), dueAt: final.dueAt, instalments: [deposit, final] }))
    expect(nextPaymentDue(bal)?.toISOString()).toBe(deposit.dueAt.toISOString())
  })
  it('once the deposit is paid, the final payment is next', () => {
    const bal = getInvoiceBalance(invoice({ total: d(4000), dueAt: final.dueAt, instalments: [deposit, final], transactions: [charge(1000)] }))
    expect(nextPaymentDue(bal)?.toISOString()).toBe(final.dueAt.toISOString())
  })
  it('nothing is due once paid in full', () => {
    const bal = getInvoiceBalance(invoice({ total: d(4000), dueAt: final.dueAt, instalments: [deposit, final], transactions: [charge(4000)] }))
    expect(nextPaymentDue(bal)).toBeNull()
  })
})
