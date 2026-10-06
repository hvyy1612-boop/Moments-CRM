import { describe, it, expect } from 'vitest'
import { describeInvoiceEvent, instalmentStatus, lastPaymentPerInstalment } from '@/features/finance/invoice-detail'

describe('invoice detail - schedule row status', () => {
  const today = '2026-09-29'
  it('reads the backend allocation first', () => {
    expect(instalmentStatus('PAID', '2026-09-01', today, 'PARTIALLY_PAID').label).toBe('Paid')
    expect(instalmentStatus('PARTIAL', '2026-09-01', today, 'PARTIALLY_PAID').label).toBe('Partially paid')
  })
  it('marks an unpaid past-due row overdue', () => {
    expect(instalmentStatus('UNPAID', '2026-09-28', today, 'SENT').label).toBe('Overdue')
  })
  it('separates due today from later instalments', () => {
    expect(instalmentStatus('UNPAID', today, today, 'SENT').label).toBe('Unpaid')
    expect(instalmentStatus('UNPAID', '2026-10-29', today, 'SENT').label).toBe('Upcoming')
    expect(instalmentStatus('UNPAID', null, today, 'SENT').label).toBe('Unpaid')
  })
  it('shows nothing due on a void invoice', () => {
    expect(instalmentStatus('UNPAID', '2026-01-01', today, 'VOID').label).toBe('Void')
  })
})

describe('invoice detail - last payment per instalment', () => {
  it('fills the schedule oldest payment first', () => {
    // $1,750 + $1,750; paid $1,000 then $1,000: the 2nd payment finishes row 1 and starts row 2.
    expect(lastPaymentPerInstalment([175000, 175000], [
      { ymd: '2026-10-01', netCents: 100000 },
      { ymd: '2026-10-05', netCents: 100000 },
    ])).toEqual(['2026-10-05', '2026-10-05'])
  })
  it('leaves untouched instalments empty and skips fully refunded payments', () => {
    expect(lastPaymentPerInstalment([175000, 175000], [
      { ymd: '2026-10-01', netCents: 175000 },
      { ymd: '2026-10-02', netCents: 0 },
    ])).toEqual(['2026-10-01', null])
  })
})

describe('invoice detail - history log', () => {
  it('describes only real recorded events', () => {
    expect(describeInvoiceEvent({ action: 'invoice.created', afterData: { total: '4995' }, invoiceNumber: 'I20260006' }))
      .toEqual({ action: 'Created', details: 'Invoice I20260006 was created for $4,995.00.' })
    expect(describeInvoiceEvent({ action: 'invoice.sent', afterData: { to: 'zoe@example.com' }, invoiceNumber: 'I1' })?.details)
      .toBe('Invoice sent to zoe@example.com.')
    expect(describeInvoiceEvent({ action: 'payment.recorded', afterData: { amount: '1750' }, invoiceNumber: 'I1', paymentMethod: 'BANK_TRANSFER' })?.details)
      .toBe('$1,750.00 payment recorded by bank transfer.')
    expect(describeInvoiceEvent({ action: 'invoice.updated', afterData: { total: '3500', instalments: 2 }, invoiceNumber: 'I1' })?.details)
      .toBe('Invoice details saved. Total $3,500.00, split into 2 payments.')
  })
  it('hides events it does not know rather than guessing', () => {
    expect(describeInvoiceEvent({ action: 'something.else', afterData: null, invoiceNumber: 'I1' })).toBeNull()
  })
})
