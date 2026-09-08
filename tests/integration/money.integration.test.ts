import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createEnquiry, convertEnquiry } from '@/lib/domain/enquiry'
import { createInvoice, issueCreditNote, issueInvoice, recordPayment, voidInvoice } from '@/lib/domain/finance'
import { closeJob } from '@/lib/domain/project'
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
  const inv = await createInvoice(projectId, { type, description: 'Coverage', amount }, null)
  await issueInvoice(inv.id, null)
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
    expect(await cache(invId)).toBe(bal?.paidNet.toString())
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
    expect(await cache(invId)).toBe('1500')
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
    await pay(invId, '1000')
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
    await pay(a, '1000')
    const b = await issuedInvoice(projectId, '1000', 'BALANCE')
    await pay(b, '500')
    const job = await getJobBalanceByProjectId(projectId)
    expect(job.outstanding.toString()).toBe('500')
    expect(job.overpaymentToResolve.toString()).toBe('0')
    expect(job.agreedContractValue).toBeNull()
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
      expect(await cache(invId)).toBe('1000')
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
      await recordPayment(invId, { paymentMethod: 'BANK_TRANSFER', amount: '500' }, null, { idempotencyKey: key })
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
      expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
      const bal = await getInvoiceBalanceById(invId)
      expect(bal?.paidNet.toString()).toBe('400')
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
      expect(bal?.paidNet.toString()).toBe('2000')
      expect(bal?.owed.toString()).toBe('2000')
      expect(await cache(invId)).toBe('2000')
    })

    it('refund and credit combine correctly (refund adds to owed, credit removes from it)', async () => {
      const invId = await issuedInvoice(await newProject(), '5000')
      await pay(invId, '2000')
      const payment = await prisma.payment.findFirst({ where: { invoiceId: invId }, orderBy: { createdAt: 'desc' } })
      await refundPayment(payment!.id, '500', {}, null)
      await issueCreditNote(invId, '500', null, null)
      const bal = await getInvoiceBalanceById(invId)
      expect(bal?.paidNet.toString()).toBe('1500')
      expect(bal?.owed.toString()).toBe('3000')
    })

    it('fully crediting an unpaid invoice → owed 0 and status PAID', async () => {
      const invId = await issuedInvoice(await newProject(), '1000')
      await issueCreditNote(invId, '1000', 'Waived', null)
      const bal = await getInvoiceBalanceById(invId)
      expect(bal?.owed.toString()).toBe('0')
      const inv = await prisma.invoice.findUnique({ where: { id: invId }, select: { status: true } })
      expect(inv?.status).toBe('PAID')
    })

    it('multiple credit notes accumulate but cannot exceed the invoice total', async () => {
      const invId = await issuedInvoice(await newProject(), '1000')
      await issueCreditNote(invId, '600', null, null)
      await issueCreditNote(invId, '400', null, null)
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
      await expect(issueCreditNote(draft.id, '100', null, null)).rejects.toThrow(/issued invoice/i)
    })

    it('a void invoice cannot be credited', async () => {
      const invId = await issuedInvoice(await newProject(), '1000')
      await voidInvoice(invId, null)
      await expect(issueCreditNote(invId, '100', null, null)).rejects.toThrow(/issued invoice/i)
    })
  })

  describe('call-site: job gates use the ledger-derived outstanding (docs/25 Part 5)', () => {

    async function completedJobReadyToClose(): Promise<string> {
      const projectId = await newProject()
      await prisma.workItem.deleteMany({ where: { projectId } })
      await prisma.project.update({ where: { id: projectId }, data: { lifecycleStatus: 'COMPLETED' } })
      return projectId
    }

    it('closeJob is blocked while a balance is owed, then succeeds once paid', async () => {
      const projectId = await completedJobReadyToClose()
      const invId = await issuedInvoice(projectId, '1000')
      await pay(invId, '400')
      await expect(closeJob(projectId, null)).rejects.toThrow(/outstanding/i)
      await pay(invId, '600')
      await closeJob(projectId, null)
      const p = await prisma.project.findUnique({ where: { id: projectId }, select: { lifecycleStatus: true } })
      expect(p?.lifecycleStatus).toBe('CLOSED')
    })

    it('a credit note that clears the obligation lets the job close (old total−amountPaid would block)', async () => {
      const projectId = await completedJobReadyToClose()
      const invId = await issuedInvoice(projectId, '1000')
      await pay(invId, '400')
      await issueCreditNote(invId, '600', 'Scope reduced', null)
      const bal = await getInvoiceBalanceById(invId)
      expect(bal?.owed.toString()).toBe('0')
      await closeJob(projectId, null)
      const p = await prisma.project.findUnique({ where: { id: projectId }, select: { lifecycleStatus: true } })
      expect(p?.lifecycleStatus).toBe('CLOSED')
    })
  })
})
