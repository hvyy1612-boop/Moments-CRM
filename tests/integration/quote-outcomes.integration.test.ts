import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { convertEnquiry, createEnquiry } from '@/lib/domain/enquiry'
import {
  createQuote,
  declineQuote,
  reviseQuote,
  saveQuoteDraft,
  sendQuote,
} from '@/lib/domain/quote'

const email = () => `it-${randomUUID()}@moments.test`

beforeAll(async () => {
  const company = await prisma.company.findFirst()
  if (!company) await prisma.company.create({ data: { name: 'Integration Studio' } })
})

/** A converted project with a quote already SENT (ready for decline / revise). */
async function sentQuote() {
  const conv = await convertEnquiry((await createEnquiry({ name: 'Quoter', email: email() })).id)
  const q = await createQuote(conv.projectId!, null)
  await saveQuoteDraft(q.versionId, [{ description: 'Coverage', quantity: 1, unitPrice: '2000' }], null)
  await sendQuote(q.quoteId, null)
  return { projectId: conv.projectId!, quoteId: q.quoteId }
}

describe('quote outcomes (integration, real DB)', () => {
  it('decline: version DECLINED + reason; operational lifecycle unchanged; idempotent', async () => {
    const { projectId, quoteId } = await sentQuote()
    const r = await declineQuote(quoteId, 'PRICE')
    expect(r.alreadyDeclined).toBe(false)

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    // Declining a quote is a quote-level fact - it must NOT move the operational lifecycle (docs/24).
    expect(project?.lifecycleStatus).toBe('CONFIRMED')
    expect(project?.lostReason).toBeNull()

    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      include: { currentVersion: true },
    })
    expect(quote?.status).toBe('DECLINED')
    expect(quote?.currentVersion?.declineReason).toBe('PRICE')

    const r2 = await declineQuote(quoteId, 'PRICE')
    expect(r2.alreadyDeclined).toBe(true)
  })

  it('revise: current version SUPERSEDED, new DRAFT copies lines; operational lifecycle unchanged', async () => {
    const { projectId, quoteId } = await sentQuote()
    const rev = await reviseQuote(quoteId)
    expect(rev.versionNumber).toBe(2)

    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      include: { currentVersion: { include: { lines: true } }, versions: true },
    })
    expect(quote?.currentVersionId).toBe(rev.versionId)
    expect(quote?.currentVersion?.status).toBe('DRAFT')
    expect(quote?.currentVersion?.lines.length).toBe(1)

    const v1 = quote?.versions.find((v) => v.versionNumber === 1)
    expect(v1?.status).toBe('SUPERSEDED')

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    // Revising a quote must not move the operational lifecycle (docs/24 Increment 1).
    expect(project?.lifecycleStatus).toBe('CONFIRMED')
  })

  it('quoting a confirmed job leaves its operational lifecycle CONFIRMED (only commercial moves)', async () => {
    const conv = await convertEnquiry((await createEnquiry({ name: 'Quoter', email: email() })).id)
    const before = await prisma.project.findUnique({ where: { id: conv.projectId! } })
    expect(before?.lifecycleStatus).toBe('CONFIRMED')

    const q = await createQuote(conv.projectId!, null)
    await saveQuoteDraft(q.versionId, [{ description: 'Coverage', quantity: 1, unitPrice: '2000' }], null)
    await sendQuote(q.quoteId, null)

    const after = await prisma.project.findUnique({ where: { id: conv.projectId! } })
    expect(after?.lifecycleStatus).toBe('CONFIRMED')
    expect(after?.commercialStatus).toBe('QUOTED')
  })

  it('an accepted quote cannot be revised', async () => {
    const { quoteId } = await sentQuote()
    // mark accepted directly (simulating client acceptance) then attempt revise
    const q = await prisma.quote.findUnique({ where: { id: quoteId } })
    await prisma.quoteVersion.update({
      where: { id: q!.currentVersionId! },
      data: { status: 'ACCEPTED' },
    })
    await expect(reviseQuote(quoteId)).rejects.toThrow()
  })
})
