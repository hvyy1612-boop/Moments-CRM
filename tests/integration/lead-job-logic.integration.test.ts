import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { convertEnquiry, createEnquiry, markEnquiryLost, reopenEnquiry } from '@/lib/domain/enquiry'
import { recordPayment } from '@/lib/domain/finance'
import { createInvoice } from './helpers'
import { acceptQuote, createQuote, createQuoteForEnquiry, saveQuoteDraft, sendQuote } from '@/lib/domain/quote'

const email = () => `lj-${randomUUID().slice(0, 8)}@moments.test`
const line = (price: string) => [{ description: 'Gold Wedding Package', quantity: 1, unitPrice: price }]

async function sentLeadQuote() {
  const lead = await createEnquiry({ name: 'Lead Job', email: email() })
  const { quoteId, versionId } = await createQuoteForEnquiry(lead.id, null)
  await saveQuoteDraft(versionId, line('4000'), null)
  await sendQuote(quoteId, null)
  return { leadId: lead.id, quoteId }
}

async function sentJobQuote(projectId: string, price = '1500') {
  const { quoteId, versionId } = await createQuote(projectId, null)
  await saveQuoteDraft(versionId, line(price), null)
  await sendQuote(quoteId, null)
  return quoteId
}

describe("a job's own quote is accepted in place", () => {
  it('accepts without a lead conversion, records it as the agreed quote, and allows only one', async () => {
    const lead = await createEnquiry({ name: 'Job Quote', email: email() })
    const { projectId } = await convertEnquiry(lead.id)
    const first = await sentJobQuote(projectId!)
    const second = await sentJobQuote(projectId!, '2000')

    const res = await acceptQuote(first, null)
    expect(res.projectId).toBe(projectId)
    const job = await prisma.project.findUniqueOrThrow({ where: { id: projectId! } })
    expect(job.commercialStatus).toBe('ACCEPTED')
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: first } })).status).toBe('ACCEPTED')

    expect(await prisma.quote.findUnique({ where: { id: second } })).toBeNull()

    const third = await sentJobQuote(projectId!, '900')
    await expect(acceptQuote(third, null)).rejects.toThrow(/already has an accepted quote/i)
  })

  it('a cancelled job cannot accept a quote', async () => {
    const lead = await createEnquiry({ name: 'Cancelled Job', email: email() })
    const { projectId } = await convertEnquiry(lead.id)
    const quoteId = await sentJobQuote(projectId!)
    await prisma.project.update({ where: { id: projectId! }, data: { lifecycleStatus: 'CANCELLED' } })
    await expect(acceptQuote(quoteId, null)).rejects.toThrow(/cancelled/i)
  })
})

describe('declining a lead that is awaiting its deposit', () => {
  it('cancels the provisional job, declines the accepted quote, and a reopened lead starts clean', async () => {
    const { leadId, quoteId } = await sentLeadQuote()
    const { projectId: firstJob } = await acceptQuote(quoteId, null)

    await markEnquiryLost(leadId, 'Declined', null)
    expect((await prisma.project.findUniqueOrThrow({ where: { id: firstJob } })).lifecycleStatus).toBe('CANCELLED')
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } })).status).toBe('DECLINED')
    const lead = await prisma.enquiry.findUniqueOrThrow({ where: { id: leadId } })
    expect(lead.status).toBe('DECLINED')
    expect(lead.convertedProjectId).toBeNull()

    await reopenEnquiry(leadId, null)
    const again = await convertEnquiry(leadId)
    expect(again.projectId).not.toBe(firstJob)
  })
})

describe('commercial status only moves forward', () => {
  it('quoting extras on a job that paid its deposit keeps "deposit paid"', async () => {
    const lead = await createEnquiry({ name: 'Paid Job', email: email() })
    const { projectId } = await convertEnquiry(lead.id)
    const inv = await createInvoice(projectId!, { type: 'DEPOSIT', description: 'Deposit', amount: '800' }, null)
    await recordPayment(inv.id, { paymentMethod: 'BANK_TRANSFER', amount: '800' }, null)
    expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId! } })).commercialStatus).toBe('DEPOSIT_PAID')
    await createQuote(projectId!, null)
    expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId! } })).commercialStatus).toBe('DEPOSIT_PAID')
  })

  it('a payment on a cancelled job never moves the job or its lead', async () => {
    const lead = await createEnquiry({ name: 'Fee After Cancel', email: email() })
    const { projectId } = await convertEnquiry(lead.id)
    const inv = await createInvoice(projectId!, { type: 'DEPOSIT', description: 'Deposit', amount: '500' }, null)
    await prisma.project.update({ where: { id: projectId! }, data: { lifecycleStatus: 'CANCELLED', commercialStatus: 'CANCELLED' } })
    await recordPayment(inv.id, { paymentMethod: 'BANK_TRANSFER', amount: '500' }, null)
    const job = await prisma.project.findUniqueOrThrow({ where: { id: projectId! } })
    expect(job.lifecycleStatus).toBe('CANCELLED')
    expect(job.commercialStatus).toBe('CANCELLED')
    expect((await prisma.enquiry.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe('AWAITING_BOOKING_CONFIRMATION')
  })
})
