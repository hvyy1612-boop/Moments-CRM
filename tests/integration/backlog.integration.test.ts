import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import {
  applyChangeRequest,
  approveChangeRequest,
  assessChangeRequest,
  createChangeRequest,
  recordClientAgreement,
} from '@/lib/domain/change-request'
import { cancelBooking, convertEnquiry, createEnquiry } from '@/lib/domain/enquiry'
import { recordPayment } from '@/lib/domain/finance'
import { createInvoice } from './helpers'
import { createQuote, saveQuoteDraft, sendQuote } from '@/lib/domain/quote'
import { refundPayment } from '@/lib/domain/refund'

const email = () => `it-${randomUUID()}@moments.test`

async function convertedProject() {
  const c = await convertEnquiry((await createEnquiry({ name: 'Backlog', email: email() })).id)
  return c.projectId!
}

/** A lead whose job is booked: converted, then the deposit paid. */
async function confirmedJob() {
  const lead = await createEnquiry({ name: 'Booker', email: email() })
  const { projectId } = await convertEnquiry(lead.id)
  const invoice = await createInvoice(projectId!, { type: 'DEPOSIT', description: 'Deposit', amount: '1000' }, null)
  await recordPayment(invoice.id, { paymentMethod: 'BANK_TRANSFER', amount: '1000', reference: 'BL-PAY' }, null)
  return { leadId: lead.id, projectId: projectId!, invoiceId: invoice.id }
}

describe('cancellation and refunds', () => {
  it('refunds up to the captured amount and never beyond it', async () => {
    const { projectId } = await confirmedJob()
    const payment = await prisma.payment.findFirst({ where: { projectId } })

    const refund = await refundPayment(payment!.id, '400', { reason: 'Partial refund' })
    expect(refund.amount.toString()).toBe('400')
    expect((await prisma.payment.findUnique({ where: { id: payment!.id } }))?.status).toBe(
      'PARTIALLY_REFUNDED',
    )

    await expect(refundPayment(payment!.id, '700')).rejects.toThrow()

    await refundPayment(payment!.id, '600')
    expect((await prisma.payment.findUnique({ where: { id: payment!.id } }))?.status).toBe('REFUNDED')
  })

  it('cancelling a booked lead cancels its job but keeps the money records', async () => {
    const { leadId, projectId, invoiceId } = await confirmedJob()
    await cancelBooking(leadId, null)
    expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).lifecycleStatus).toBe('CANCELLED')
    expect(await prisma.invoice.findUnique({ where: { id: invoiceId } })).not.toBeNull()
    expect(await prisma.payment.count({ where: { projectId } })).toBe(1)
  })
})

describe('change requests', () => {
  it('runs PENDING -> assessed -> approved -> applied, and a commercial change revises the quote', async () => {
    const projectId = await convertedProject()
    const q = await createQuote(projectId, null)
    await saveQuoteDraft(q.versionId, [{ description: 'Base', quantity: 1, unitPrice: '2000' }], null)
    await sendQuote(q.quoteId, null)

    const request = await createChangeRequest(
      projectId,
      { kind: 'scopeChange', summary: 'Add an extra hour of coverage', fee: { amount: '300' } },
      { requestedByType: 'client' },
    )
    await assessChangeRequest(request.id)
    await approveChangeRequest(request.id, null)
    await recordClientAgreement(request.id, { via: 'email' })
    const applied = await applyChangeRequest(request.id, null)

    expect(applied.status).toBe('APPLIED')
    expect(applied.resultingQuoteVersionId).toBeTruthy()
    expect(await prisma.quoteVersion.count({ where: { quoteId: q.quoteId } })).toBe(2)
    // The agreed (revised) scope keeps the quote reading Accepted, not a stray Draft/Pending.
    expect((await prisma.quote.findUnique({ where: { id: q.quoteId } }))?.status).toBe('ACCEPTED')
  })
})
