import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createClient } from '@/lib/domain/client'
import { convertEnquiry, createEnquiry } from '@/lib/domain/enquiry'
import { clientVisibleQuoteVersionId, createQuoteForEnquiry, reviseQuote, saveQuoteDraft, sendQuote } from '@/lib/domain/quote'

const email = () => `ql-${randomUUID().slice(0, 8)}@moments.test`
let userId = ''
beforeAll(async () => {
  userId = (await prisma.user.findFirstOrThrow({ select: { id: true } })).id
})

async function sentQuote() {
  const enquiry = await createEnquiry({ name: 'Quote Client', email: email() })
  const { quoteId, versionId } = await createQuoteForEnquiry(enquiry.id, null)
  await saveQuoteDraft(
    versionId,
    [{ description: 'Gold Wedding Package', details: '10 hours\nAlbum', quantity: 1, unitPrice: '4995', lineType: 'package' }],
    null,
    { poNumber: 'PO-77', notes: 'Payment terms apply.', depositPercent: 50, issueDate: new Date('2026-10-05T00:00:00Z') },
  )
  await sendQuote(quoteId, null)
  return { quoteId, versionId }
}

describe('revising a sent quote keeps everything the client was sent', () => {
  it('copies deposit %, notes, PO number, issue date and each line\'s package details', async () => {
    const { quoteId, versionId } = await sentQuote()
    await reviseQuote(quoteId, null)
    const q = await prisma.quote.findUnique({ where: { id: quoteId }, select: { currentVersion: { include: { lines: true } } } })
    const v = q!.currentVersion!
    expect(v.id).not.toBe(versionId)
    expect(v.status).toBe('DRAFT')
    expect(v.depositPercent).toBe(50)
    expect(v.notes).toBe('Payment terms apply.')
    expect(v.poNumber).toBe('PO-77')
    expect(v.issueDate?.toISOString()).toBe('2026-10-05T00:00:00.000Z')
    expect(v.lines[0]?.details).toBe('10 hours\nAlbum')
  })

  it('the client link keeps showing the last sent version while the revision is a draft', async () => {
    const { quoteId, versionId } = await sentQuote()
    await reviseQuote(quoteId, null)
    expect(await clientVisibleQuoteVersionId(quoteId)).toBe(versionId)
  })

  it('an unsent draft quote is not visible to the client', async () => {
    const enquiry = await createEnquiry({ name: 'Draft Only', email: email() })
    const { quoteId } = await createQuoteForEnquiry(enquiry.id, null)
    expect(await clientVisibleQuoteVersionId(quoteId)).toBeNull()
  })
})

describe('converting a lead uses the client it is linked to', () => {
  it('a lead whose client email was corrected converts onto THAT client (no duplicate)', async () => {
    const client = await createClient({ firstName: 'Linked', lastName: 'Client', email: email() }, userId)
    const enquiry = await createEnquiry({ name: 'Linked Client', email: `typo-${randomUUID().slice(0, 6)}@moments.test`, clientId: client.id })
    const conv = await convertEnquiry(enquiry.id)
    expect(conv.clientId).toBe(client.id)
    expect((await prisma.project.findUnique({ where: { id: conv.projectId! } }))?.clientId).toBe(client.id)
  })

  it('a website lead gets a numbered client and becomes linked to it', async () => {
    const enquiry = await createEnquiry({ name: 'Web Lead', email: email() })
    const conv = await convertEnquiry(enquiry.id)
    const client = await prisma.client.findUnique({ where: { id: conv.clientId! }, select: { clientNumber: true } })
    expect(client?.clientNumber).toMatch(/^C\d{8}$/)
    expect((await prisma.enquiry.findUnique({ where: { id: enquiry.id } }))?.clientId).toBe(conv.clientId)
  })
})
