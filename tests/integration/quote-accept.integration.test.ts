import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createEnquiry } from '@/lib/domain/enquiry'
import { acceptQuote, createQuoteForEnquiry, saveQuoteDraft, sendQuote } from '@/lib/domain/quote'

const email = () => `it-${randomUUID()}@moments.test`

beforeAll(async () => {
  const company = await prisma.company.findFirst()
  if (!company) await prisma.company.create({ data: { name: 'Integration Studio' } })
})

/** A quote created for an enquiry (no project yet), saved with a line, and SENT. */
async function sentEnquiryQuote(amount = '3500') {
  const enquiry = await createEnquiry({ name: 'Lead ' + randomUUID().slice(0, 6), email: email() })
  const q = await createQuoteForEnquiry(enquiry.id, null)
  await saveQuoteDraft(q.versionId, [{ description: 'Wedding package', quantity: 1, unitPrice: amount }], null)
  await sendQuote(q.quoteId, null)
  return { enquiryId: enquiry.id, quoteId: q.quoteId }
}

describe('acceptQuote — enquiry-stage quote → job (docs/31, integration)', () => {
  it('a new quote belongs to the enquiry and has no project', async () => {
    const enquiry = await createEnquiry({ name: 'Lead', email: email() })
    const q = await createQuoteForEnquiry(enquiry.id, null)
    const quote = await prisma.quote.findUnique({ where: { id: q.quoteId } })
    expect(quote?.enquiryId).toBe(enquiry.id)
    expect(quote?.projectId).toBeNull()
    expect(quote?.seq).toBeGreaterThan(0)
    expect(quote?.status).toBe('DRAFT')
  })

  it('accepting a sent quote converts the enquiry into a job and links both ways', async () => {
    const { enquiryId, quoteId } = await sentEnquiryQuote()
    const res = await acceptQuote(quoteId, null)
    expect(res.projectId).toBeTruthy()

    const quote = await prisma.quote.findUnique({ where: { id: quoteId } })
    const enquiry = await prisma.enquiry.findUnique({ where: { id: enquiryId } })
    const project = await prisma.project.findUnique({ where: { id: res.projectId } })

    expect(quote?.status).toBe('ACCEPTED')
    expect(quote?.projectId).toBe(res.projectId) // legacy link set on accept
    expect(enquiry?.status).toBe('CONVERTED')
    expect(enquiry?.convertedProjectId).toBe(res.projectId)
    expect(project?.sourceQuoteId).toBe(quoteId)
    expect(project?.lifecycleStatus).toBe('BOOKING_REQUESTED')
    expect(project?.commercialStatus).toBe('ACCEPTED')
  })

  it('accepting one quote supersedes the enquiry\'s other open quotes', async () => {
    const enquiry = await createEnquiry({ name: 'Lead', email: email() })
    const q1 = await createQuoteForEnquiry(enquiry.id, null)
    await saveQuoteDraft(q1.versionId, [{ description: 'Option A', quantity: 1, unitPrice: '3000' }], null)
    await sendQuote(q1.quoteId, null)
    const q2 = await createQuoteForEnquiry(enquiry.id, null)
    await saveQuoteDraft(q2.versionId, [{ description: 'Option B', quantity: 1, unitPrice: '5000' }], null)
    await sendQuote(q2.quoteId, null)

    await acceptQuote(q2.quoteId, null)
    const a = await prisma.quote.findUnique({ where: { id: q1.quoteId } })
    const b = await prisma.quote.findUnique({ where: { id: q2.quoteId } })
    expect(b?.status).toBe('ACCEPTED')
    expect(a?.status).toBe('SUPERSEDED')
  })

  it('only a SENT quote can be accepted; a draft cannot', async () => {
    const enquiry = await createEnquiry({ name: 'Lead', email: email() })
    const q = await createQuoteForEnquiry(enquiry.id, null)
    await saveQuoteDraft(q.versionId, [{ description: 'X', quantity: 1, unitPrice: '1000' }], null)
    await expect(acceptQuote(q.quoteId, null)).rejects.toThrow(/sent quote/i)
  })

  it('re-accepting is guarded: a second accept on the same quote throws', async () => {
    const { quoteId } = await sentEnquiryQuote()
    await acceptQuote(quoteId, null)
    await expect(acceptQuote(quoteId, null)).rejects.toThrow()
  })
})
