import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createEnquiry, convertEnquiry } from '@/lib/domain/enquiry'
import { createInvoice, createInvoiceWithLines, deleteInvoice, issueCreditNote, markOverdueInvoices, recordPayment, voidInvoice } from '@/lib/domain/finance'
import { sydneyLocalToUtc } from '@/lib/time'
import { closeJob } from '@/lib/domain/project'
import { seedProjectWorkflow } from '@/lib/domain/project-workflow'
import { refundPayment } from '@/lib/domain/refund'
import { getInvoiceBalanceById, getJobBalanceByProjectId } from '@/lib/domain/invoice-money'

const email = () => `money-${randomUUID()}@moments.test`

beforeAll(async () => {
  const company = await prisma.company.findFirst()
  if (!company) await prisma.company.create({ data: { name: 'Integration Studio' } })
})

async function newProject(): Promise<string> {
  const conv = await convertEnquiry((await createEnquiry({ name: 'Payer', email: email() })).id)
  return conv.projectId as string
}

async function issuedInvoice(projectId: string, amount: string, type: 'DEPOSIT' | 'BALANCE' | 'SUPPLEMENTARY' = 'DEPOSIT') {
  // Invoices are official (ISSUED) the moment they are created - there is no draft step any more.
  const inv = await createInvoice(projectId, { type, description: 'Coverage', amount }, null)
  return inv.id
}

const pay = (invoiceId: string, amount: string) =>
  recordPayment(invoiceId, { paymentMethod: 'BANK_TRANSFER', amount }, null)

async function cache(invoiceId: string): Promise<string> {
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { amountPaid: true } })
  return inv!.amountPaid.toString()
}

describe('Money foundation against a real DB (docs/25 Part 1)', () => {
  it('partial payment → owed correct, cache == ledger, status PARTIALLY_PAID', async () => {
    const invId = await issuedInvoice(await newProject(), '5000')
    await pay(invId, '2000')
    const bal = await getInvoiceBalanceById(invId)
    expect(bal?.paidNet.toString()).toBe('2000')
    expect(bal?.owed.toString()).toBe('3000')
    expect(await cache(invId)).toBe(bal?.paidNet.toString()) // cache == ledger
    const inv = await prisma.invoice.findUnique({ where: { id: invId }, select: { status: true } })
    expect(inv?.status).toBe('PARTIALLY_PAID')
  })

  it('full payment → owed 0, status PAID', async () => {
    const invId = await issuedInvoice(await newProject(), '1000')
    await pay(invId, '1000')
    const bal = await getInvoiceBalanceById(invId)
    expect(bal?.owed.toString()).toBe('0')
    expect(bal?.overpaymentToResolve.toString()).toBe('0')
    const inv = await prisma.invoice.findUnique({ where: { id: invId }, select: { status: true } })
    expect(inv?.status).toBe('PAID')
  })

  it('refund ≠ discount: refund increases owed, nets paidNet, cache == ledger', async () => {
    const invId = await issuedInvoice(await newProject(), '5000')
    await pay(invId, '2000')
    const payment = await prisma.payment.findFirst({ where: { invoiceId: invId }, orderBy: { createdAt: 'desc' } })
    await refundPayment(payment!.id, '500', {}, null)
    const bal = await getInvoiceBalanceById(invId)
    expect(bal?.paidNet.toString()).toBe('1500')
    expect(bal?.owed.toString()).toBe('3500')
    expect(await cache(invId)).toBe('1500') // cache == ledger, both net of the refund
  })

  it('two separate payments add up (not double-counted)', async () => {
    const invId = await issuedInvoice(await newProject(), '5000')
    await pay(invId, '1000')
    await pay(invId, '1500')
    const bal = await getInvoiceBalanceById(invId)
    expect(bal?.paidNet.toString()).toBe('2500')
    expect(bal?.owed.toString()).toBe('2500')
    expect(await cache(invId)).toBe('2500')
  })

  it('over-balance payment is rejected atomically (no partial write)', async () => {
    const invId = await issuedInvoice(await newProject(), '1000')
    await pay(invId, '1000') // PAID
    await expect(pay(invId, '1')).rejects.toThrow()
    const bal = await getInvoiceBalanceById(invId)
    expect(bal?.paidNet.toString()).toBe('1000')
    expect(bal?.owed.toString()).toBe('0')
  })

  it('voidInvoice refuses an invoice that has money (prevents VOID-with-money)', async () => {
    const invId = await issuedInvoice(await newProject(), '1000')
    await pay(invId, '500')
    await expect(voidInvoice(invId, null)).rejects.toThrow(/payments recorded/i)
  })

  it('job balance: outstanding and overpayment aggregated separately; agreed unknown → not settled', async () => {
    const projectId = await newProject()
    const a = await issuedInvoice(projectId, '1000', 'DEPOSIT')
    await pay(a, '1000') // owed 0
    const b = await issuedInvoice(projectId, '1000', 'BALANCE')
    await pay(b, '500') // owed 500
    const job = await getJobBalanceByProjectId(projectId)
    expect(job.outstanding.toString()).toBe('500')
    expect(job.overpaymentToResolve.toString()).toBe('0')
    expect(job.agreedContractValue).toBeNull() // no accepted quote, no package snapshot
    expect(job.isFullySettled).toBe(false)
  })

  const chargeCount = (invoiceId: string) =>
    prisma.paymentTransaction.count({ where: { payment: { invoiceId }, type: 'CHARGE', status: 'SUCCEEDED' } })

  describe('F-1: concurrency + idempotency for money writers (fixed; regression)', () => {
    it('two concurrent full payments on a $1000 invoice → exactly one succeeds; ledger == cache == 1000', async () => {
      const invId = await issuedInvoice(await newProject(), '1000')
      const r = await Promise.allSettled([pay(invId, '1000'), pay(invId, '1000')])
      expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
      const bal = await getInvoiceBalanceById(invId)
      expect(bal?.paidNet.toString()).toBe('1000')
      expect(await cache(invId)).toBe('1000') // cache == ledger, no silent overpay
      expect(await chargeCount(invId)).toBe(1)
    })

    it('two concurrent valid payments ($400 + $600) → both succeed; total $1000', async () => {
      const invId = await issuedInvoice(await newProject(), '1000')
      const r = await Promise.allSettled([pay(invId, '400'), pay(invId, '600')])
      expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(2)
      const bal = await getInvoiceBalanceById(invId)
      expect(bal?.paidNet.toString()).toBe('1000')
      expect(bal?.owed.toString()).toBe('0')
      expect(await cache(invId)).toBe('1000')
    })

    it('retry of the same payment request (same idempotency key) records only one charge', async () => {
      const invId = await issuedInvoice(await newProject(), '1000')
      const key = `idem-${randomUUID()}`
      await recordPayment(invId, { paymentMethod: 'BANK_TRANSFER', amount: '500' }, null, { idempotencyKey: key })
      await recordPayment(invId, { paymentMethod: 'BANK_TRANSFER', amount: '500' }, null, { idempotencyKey: key }) // retry
      expect(await chargeCount(invId)).toBe(1)
      const bal = await getInvoiceBalanceById(invId)
      expect(bal?.paidNet.toString()).toBe('500')
    })

    it('two concurrent refunds exceeding refundable → no over-refund; cache == ledger', async () => {
      const invId = await issuedInvoice(await newProject(), '1000')
      await pay(invId, '1000')
      const payment = await prisma.payment.findFirst({ where: { invoiceId: invId }, orderBy: { createdAt: 'desc' } })
      const r = await Promise.allSettled([
        refundPayment(payment!.id, '600', {}, null),
        refundPayment(payment!.id, '600', {}, null),
      ])
      expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1) // 600 + 600 > 1000 captured
      const bal = await getInvoiceBalanceById(invId)
      expect(bal?.paidNet.toString()).toBe('400') // 1000 − 600
      expect(await cache(invId)).toBe('400')
    })

    it('payment concurrent with void → never a VOID invoice holding unprocessed money', async () => {
      const invId = await issuedInvoice(await newProject(), '1000')
      await Promise.allSettled([pay(invId, '1000'), voidInvoice(invId, null)])
      const inv = await prisma.invoice.findUnique({ where: { id: invId }, select: { status: true } })
      const paidNet = (await getInvoiceBalanceById(invId))?.paidNet.toString() ?? '0'
      expect(inv?.status === 'VOID' && paidNet !== '0').toBe(false)
    })
  })

  describe('CreditNote: reduces obligation, never the payment ledger (docs/25 Rule M2/M8)', () => {
    it('credit note reduces owed without touching paidNet or amountPaid', async () => {
      const invId = await issuedInvoice(await newProject(), '5000')
      await pay(invId, '2000')
      await issueCreditNote(invId, '1000', 'Goodwill discount', null)
      const bal = await getInvoiceBalanceById(invId)
      expect(bal?.paidNet.toString()).toBe('2000') // payment ledger untouched
      expect(bal?.owed.toString()).toBe('2000') // obligation 4000 − paidNet 2000
      expect(await cache(invId)).toBe('2000') // amountPaid still tracks the ledger, not the credit
    })

    it('refund and credit combine correctly (refund adds to owed, credit removes from it)', async () => {
      const invId = await issuedInvoice(await newProject(), '5000')
      await pay(invId, '2000')
      const payment = await prisma.payment.findFirst({ where: { invoiceId: invId }, orderBy: { createdAt: 'desc' } })
      await refundPayment(payment!.id, '500', {}, null) // paidNet → 1500
      await issueCreditNote(invId, '500', null, null) // obligation → 4500
      const bal = await getInvoiceBalanceById(invId)
      expect(bal?.paidNet.toString()).toBe('1500')
      expect(bal?.owed.toString()).toBe('3000') // 4500 − 1500
    })

    it('fully crediting an unpaid invoice → owed 0 and status PAID', async () => {
      const invId = await issuedInvoice(await newProject(), '1000')
      await issueCreditNote(invId, '1000', 'Waived', null)
      const bal = await getInvoiceBalanceById(invId)
      expect(bal?.owed.toString()).toBe('0')
      const inv = await prisma.invoice.findUnique({ where: { id: invId }, select: { status: true } })
      expect(inv?.status).toBe('PAID') // obligation 0, paidNet 0 ⇒ settled
    })

    it('multiple credit notes accumulate but cannot exceed the invoice total', async () => {
      const invId = await issuedInvoice(await newProject(), '1000')
      await issueCreditNote(invId, '600', null, null)
      await issueCreditNote(invId, '400', null, null) // 600 + 400 = 1000, exactly the total
      await expect(issueCreditNote(invId, '1', null, null)).rejects.toThrow(/exceed the invoice total/i)
      const bal = await getInvoiceBalanceById(invId)
      expect(bal?.owed.toString()).toBe('0')
    })

    it('a credit note larger than the invoice total is rejected', async () => {
      const invId = await issuedInvoice(await newProject(), '1000')
      await expect(issueCreditNote(invId, '1001', null, null)).rejects.toThrow(/exceed the invoice total/i)
    })

    it('a draft invoice cannot be credited', async () => {
      const projectId = await newProject()
      const draft = await createInvoice(projectId, { type: 'DEPOSIT', description: 'Coverage', amount: '1000' }, null)
      // New invoices are never drafts; a legacy DRAFT row (still in the enum for history) must stay uncreditable.
      await prisma.invoice.update({ where: { id: draft.id }, data: { status: 'DRAFT' } })
      await expect(issueCreditNote(draft.id, '100', null, null)).rejects.toThrow(/issued invoice/i)
    })

    it('a void invoice cannot be credited', async () => {
      const invId = await issuedInvoice(await newProject(), '1000')
      await voidInvoice(invId, null) // no money on it, so the void succeeds
      await expect(issueCreditNote(invId, '100', null, null)).rejects.toThrow(/issued invoice/i)
    })
  })

  describe('call-site: job gates use the ledger-derived outstanding (docs/25 Part 5)', () => {
    // Drive a project to COMPLETED with no blocking tasks so closeJob's only remaining gate is money.
    async function completedJobReadyToClose(): Promise<string> {
      const projectId = await newProject()
      // A real finished job: its workflow was seeded (so a later payment never re-seeds it) and every task
      // is done - closeJob also refuses while tasks are open.
      await seedProjectWorkflow(projectId)
      await prisma.workItem.updateMany({ where: { projectId }, data: { status: 'COMPLETED' } })
      await prisma.project.update({ where: { id: projectId }, data: { lifecycleStatus: 'COMPLETED' } })
      return projectId
    }

    it('closeJob is blocked while a balance is owed, then succeeds once paid', async () => {
      const projectId = await completedJobReadyToClose()
      const invId = await issuedInvoice(projectId, '1000')
      await pay(invId, '400')
      await expect(closeJob(projectId, null)).rejects.toThrow(/outstanding/i)
      await pay(invId, '600') // now owed 0
      await closeJob(projectId, null)
      const p = await prisma.project.findUnique({ where: { id: projectId }, select: { lifecycleStatus: true } })
      expect(p?.lifecycleStatus).toBe('CLOSED')
    })

    it('a credit note that clears the obligation lets the job close (old total−amountPaid would block)', async () => {
      const projectId = await completedJobReadyToClose()
      const invId = await issuedInvoice(projectId, '1000')
      await pay(invId, '400') // owed 600 by payment alone
      await issueCreditNote(invId, '600', 'Scope reduced', null) // obligation 400, paidNet 400 ⇒ owed 0
      const bal = await getInvoiceBalanceById(invId)
      expect(bal?.owed.toString()).toBe('0')
      await closeJob(projectId, null) // credit-aware outstanding = 0
      const p = await prisma.project.findUnique({ where: { id: projectId }, select: { lifecycleStatus: true } })
      expect(p?.lifecycleStatus).toBe('CLOSED')
    })
  })
})

describe('bug-scan 2026-10-05: money fixes against a real DB', () => {
  const lines = (amount: string) => [{ itemName: 'Coverage', description: 'Coverage', quantity: 1, unitPrice: amount, discount: '' }]
  const splitDeposit = (projectId: string) =>
    createInvoiceWithLines(projectId, {
      type: 'DEPOSIT',
      lines: lines('4000'),
      instalments: [
        { label: 'Deposit (25%)', dueAt: '2026-10-05', amount: '1000' },
        { label: 'Final payment (75%)', dueAt: '2027-05-29', amount: '3000' },
      ],
    }, null)
  const leadAndJob = async () => {
    const e = await createEnquiry({ name: 'Split deposit', email: email() })
    const conv = await convertEnquiry(e.id)
    return { enquiryId: e.id, projectId: conv.projectId as string }
  }

  it('paying the deposit instalment of a split DEPOSIT invoice confirms the booking (company policy)', async () => {
    const { enquiryId, projectId } = await leadAndJob()
    const inv = await splitDeposit(projectId)
    await pay(inv.id, '1000')
    const p = await prisma.project.findUnique({ where: { id: projectId }, select: { lifecycleStatus: true, commercialStatus: true } })
    expect(p?.lifecycleStatus).toBe('CONFIRMED')
    expect(p?.commercialStatus).toBe('DEPOSIT_PAID')
    expect((await prisma.enquiry.findUnique({ where: { id: enquiryId } }))?.status).toBe('BOOKING_CONFIRMED')
    expect((await prisma.invoice.findUnique({ where: { id: inv.id } }))?.status).toBe('PARTIALLY_PAID')
  })

  it('part of the deposit does not confirm the booking', async () => {
    const { projectId } = await leadAndJob()
    const inv = await splitDeposit(projectId)
    await pay(inv.id, '500')
    expect((await prisma.project.findUnique({ where: { id: projectId } }))?.lifecycleStatus).toBe('BOOKING_REQUESTED')
  })

  it('credit-aware: after a $200 credit, $800 settles a $1,000 invoice and more is refused', async () => {
    const invId = await issuedInvoice(await newProject(), '1000')
    await issueCreditNote(invId, '200', 'Price decrease', null)
    await expect(pay(invId, '900')).rejects.toThrow(/more than the balance due/i)
    await pay(invId, '800')
    expect((await prisma.invoice.findUnique({ where: { id: invId } }))?.status).toBe('PAID')
  })

  it('a hand-typed next invoice number does not break automatic numbering', async () => {
    const projectId = await newProject()
    const a = await createInvoiceWithLines(projectId, { type: 'BALANCE', lines: lines('100') }, null)
    const seq = Number(a.invoiceNumber.slice(-4))
    const typed = `${a.invoiceNumber.slice(0, -4)}${String(seq + 1).padStart(4, '0')}`
    await createInvoiceWithLines(projectId, { type: 'BALANCE', lines: lines('100'), invoiceNumber: typed }, null)
    const c = await createInvoiceWithLines(projectId, { type: 'BALANCE', lines: lines('100') }, null)
    expect(c.invoiceNumber).not.toBe(typed)
    expect(Number(c.invoiceNumber.slice(-4))).toBe(seq + 2)
  })

  it('a single-payment invoice carries its due date on the instalment (reminders need it), in Sydney days', async () => {
    const projectId = await newProject()
    const inv = await createInvoiceWithLines(projectId, { type: 'BALANCE', lines: lines('500'), invoiceDate: '2027-03-30', due: 'NET7' }, null)
    const row = await prisma.invoice.findUnique({ where: { id: inv.id }, select: { dueAt: true, instalments: { select: { dueAt: true } } } })
    // 30 Mar 2027 + 7 days crosses the end of daylight saving (4 Apr): still due on 6 Apr, Sydney midnight.
    expect(row?.dueAt?.toISOString()).toBe(sydneyLocalToUtc('2027-04-06T00:00').toISOString())
    expect(row?.instalments[0]?.dueAt?.toISOString()).toBe(row?.dueAt?.toISOString())
  })

  it('an invoice is overdue only after its due day has passed (Sydney)', async () => {
    const projectId = await newProject()
    const inv = await createInvoiceWithLines(projectId, { type: 'BALANCE', lines: lines('500'), invoiceDate: '2026-11-10', due: 'ON_ISSUE' }, null)
    await markOverdueInvoices(sydneyLocalToUtc('2026-11-10T09:00'))
    expect((await prisma.invoice.findUnique({ where: { id: inv.id } }))?.status).toBe('ISSUED')
    await markOverdueInvoices(sydneyLocalToUtc('2026-11-11T09:00'))
    expect((await prisma.invoice.findUnique({ where: { id: inv.id } }))?.status).toBe('OVERDUE')
  })

  it('an invoice whose payment was fully refunded cannot be deleted (friendly error, no crash)', async () => {
    const projectId = await newProject()
    const invId = await issuedInvoice(projectId, '300')
    await pay(invId, '300')
    const payment = await prisma.payment.findFirst({ where: { invoiceId: invId } })
    await refundPayment(payment!.id, '300', { reason: 'Full refund' })
    await expect(deleteInvoice(invId, null)).rejects.toThrow(/payment history/i)
  })
})
