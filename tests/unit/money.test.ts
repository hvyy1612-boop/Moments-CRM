import { describe, expect, it } from 'vitest'
import { Prisma } from '@prisma/client'
import {
  allocatePaymentsToInstalments,
  computePaidNet,
  getInvoiceBalance,
  getJobBalance,
  type InvoiceMoneyInput,
} from '@/lib/domain/money'

const d = (n: number | string) => new Prisma.Decimal(n)
const charge = (amount: number) => ({ type: 'CHARGE' as const, status: 'SUCCEEDED' as const, amount: d(amount) })
const refund = (amount: number) => ({ type: 'REFUND' as const, status: 'SUCCEEDED' as const, amount: d(amount) })
const reversal = (amount: number) => ({ type: 'REVERSAL' as const, status: 'SUCCEEDED' as const, amount: d(amount) })
const inst = (amount: number, sortOrder = 0, dueAt: Date | null = null, label: string | null = null) => ({
  label,
  dueAt,
  amount: d(amount),
  sortOrder,
})

function invoice(partial: Partial<InvoiceMoneyInput>): InvoiceMoneyInput {
  return { status: 'ISSUED', total: d(0), dueAt: null, instalments: [], transactions: [], creditNotes: [], ...partial }
}

describe('getInvoiceBalance — the money invariant (docs/25 Part 1)', () => {
  it('M-a: $5,000 invoice, paid $2,000 → owed $3,000', () => {
    const b = getInvoiceBalance(invoice({ total: d(5000), transactions: [charge(2000)] }))
    expect(b.obligation.toString()).toBe('5000')
    expect(b.paidNet.toString()).toBe('2000')
    expect(b.owed.toString()).toBe('3000')
    expect(b.overpaymentToResolve.toString()).toBe('0')
  })

  it('M-b: refund $500, no discount → owed $3,500 (a refund is NOT a discount)', () => {
    const b = getInvoiceBalance(invoice({ total: d(5000), transactions: [charge(2000), refund(500)] }))
    expect(b.obligation.toString()).toBe('5000')
    expect(b.paidNet.toString()).toBe('1500')
    expect(b.owed.toString()).toBe('3500')
  })

  it('M-c: credit note $500 AND refund $500 → owed $3,000 (two independent effects)', () => {
    const b = getInvoiceBalance(
      invoice({ total: d(5000), transactions: [charge(2000), refund(500)], creditNotes: [{ amount: d(500) }] }),
    )
    expect(b.creditedTotal.toString()).toBe('500')
    expect(b.obligation.toString()).toBe('4500')
    expect(b.paidNet.toString()).toBe('1500')
    expect(b.owed.toString()).toBe('3000')
  })

  it('M-g: reduce below amount paid → overpayment surfaced, owed never negative', () => {
    const b = getInvoiceBalance(invoice({ total: d(1000), transactions: [charge(1200)] }))
    expect(b.owed.toString()).toBe('0')
    expect(b.overpaymentToResolve.toString()).toBe('200')
  })

  it('DRAFT and VOID carry no obligation (Rule M1)', () => {
    expect(getInvoiceBalance(invoice({ status: 'DRAFT', total: d(5000) })).obligation.toString()).toBe('0')
    expect(getInvoiceBalance(invoice({ status: 'VOID', total: d(5000), transactions: [charge(100)] })).owed.toString()).toBe('0')
  })

  it('REVERSAL subtracts like a refund (Rule M2b)', () => {
    const b = getInvoiceBalance(invoice({ total: d(1000), transactions: [charge(1000), reversal(400)] }))
    expect(b.paidNet.toString()).toBe('600')
    expect(b.owed.toString()).toBe('400')
  })

  it('non-SUCCEEDED transactions are ignored', () => {
    const b = getInvoiceBalance(
      invoice({ total: d(1000), transactions: [{ type: 'CHARGE', status: 'PENDING', amount: d(1000) }] }),
    )
    expect(b.paidNet.toString()).toBe('0')
    expect(b.owed.toString()).toBe('1000')
  })

  it('refunds are counted ONCE — the ledger is the only cash source (no double-count)', () => {
    // The pure model takes the PaymentTransaction ledger; the Refund model is metadata, never summed on top.
    const b = getInvoiceBalance(invoice({ total: d(5000), transactions: [charge(2000), refund(500)] }))
    expect(b.paidNet.toString()).toBe('1500')
  })
})

describe('computePaidNet', () => {
  it('nets charges, refunds and reversals, ignoring failed rows', () => {
    const net = computePaidNet([
      charge(1000),
      refund(200),
      reversal(100),
      { type: 'CHARGE', status: 'FAILED', amount: d(999) },
    ])
    expect(net.toString()).toBe('700')
  })
})

describe('allocatePaymentsToInstalments — FIFO (Rule M5)', () => {
  it('M-f: instalment 1 fully paid, instalment 2 partial → reminder target is instalment 2', () => {
    const rows = allocatePaymentsToInstalments(d(1200), [inst(1000, 0), inst(1000, 1)])
    expect(rows.map((r) => r.state)).toEqual(['PAID', 'PARTIAL'])
    expect(rows.map((r) => r.remaining.toString())).toEqual(['0', '800'])
  })

  it('nothing paid → all UNPAID', () => {
    const rows = allocatePaymentsToInstalments(d(0), [inst(1000, 0), inst(1000, 1)])
    expect(rows.map((r) => r.state)).toEqual(['UNPAID', 'UNPAID'])
  })

  it('orders by sortOrder then dueAt regardless of input order', () => {
    const earlier = new Date('2026-01-01')
    const later = new Date('2026-02-01')
    const rows = allocatePaymentsToInstalments(d(1000), [inst(1000, 0, later), inst(1000, 0, earlier)])
    expect(rows.map((r) => r.dueAt)).toEqual([earlier, later])
    expect(rows.map((r) => r.state)).toEqual(['PAID', 'UNPAID'])
  })

  it('does not allocate negative pools (net refunded below zero)', () => {
    const rows = allocatePaymentsToInstalments(d(-50), [inst(1000, 0)])
    expect(rows.map((r) => r.allocatedPaid.toString())).toEqual(['0'])
    expect(rows.map((r) => r.state)).toEqual(['UNPAID'])
  })
})

describe('getJobBalance — outstanding and overpayment aggregated separately (Rule M3)', () => {
  it('M-d: invoice A overpaid $200, invoice B owed $500 → Outstanding $500 + Overpayment $200 (NOT netted $300)', () => {
    const a = invoice({ total: d(1000), transactions: [charge(1200)] })
    const b = invoice({ total: d(1000), transactions: [charge(500)] })
    const job = getJobBalance([a, b], null)
    expect(job.outstanding.toString()).toBe('500')
    expect(job.overpaymentToResolve.toString()).toBe('200')
    expect(job.netPosition.toString()).toBe('300') // reference figure only
  })

  it('M-e: deposit paid in full but agreed value higher → uninvoicedRemainder > 0 (job not settled)', () => {
    const deposit = invoice({ total: d(1500), transactions: [charge(1500)] })
    const job = getJobBalance([deposit], d(5000))
    expect(job.outstanding.toString()).toBe('0')
    expect(job.invoicedObligation.toString()).toBe('1500')
    expect(job.agreedContractValue.toString()).toBe('5000')
    expect(job.uninvoicedRemainder.toString()).toBe('3500')
  })

  it('M-4b: no accepted quote → agreed value falls back to invoiced obligation', () => {
    const job = getJobBalance([invoice({ total: d(2000) })], null)
    expect(job.agreedContractValue.toString()).toBe('2000')
    expect(job.uninvoicedRemainder.toString()).toBe('0')
  })

  it('DRAFT invoices never inflate the job obligation (old-data safety)', () => {
    const draft = invoice({ status: 'DRAFT', total: d(9999) })
    const issued = invoice({ total: d(1000), transactions: [charge(1000)] })
    const job = getJobBalance([draft, issued], null)
    expect(job.invoicedObligation.toString()).toBe('1000')
    expect(job.outstanding.toString()).toBe('0')
  })

  it('supplementary + deposit invoices do not double-count obligation', () => {
    const deposit = invoice({ total: d(1500), transactions: [charge(1500)] })
    const supplementary = invoice({ total: d(500), transactions: [] }) // e.g. an added fee, unpaid
    const job = getJobBalance([deposit, supplementary], d(2000))
    expect(job.invoicedObligation.toString()).toBe('2000')
    expect(job.outstanding.toString()).toBe('500')
    expect(job.uninvoicedRemainder.toString()).toBe('0')
  })
})
