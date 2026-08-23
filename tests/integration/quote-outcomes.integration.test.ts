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

async function sentQuote() {
  const conv = await convertEnquiry((await createEnquiry({ name: 'Quoter', email: email() })).id)
  const q = await createQuote(conv.projectId!, null)
  await saveQuoteDraft(q.versionId, [{ description: 'Coverage', quantity: 1, unitPrice: '2000' }], null)
  await sendQuote(q.quoteId, null)
  return { projectId: conv.projectId!, quoteId: q.quoteId }
}

describe('quote outcomes (integration, real DB)', () => {
  it('decline: version DECLINED + reason, project LOST + reason, commercial CANCELLED; idempotent', async () => {
    const { projectId, quoteId } = await sentQuote()
    const r = await declineQuote(quoteId, 'PRICE')
    expect(r.alreadyDeclined).toBe(false)

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    expect(project?.lifecycleStatus).toBe('LOST')
    expect(project?.lostReason).toBe('PRICE')
    expect(project?.commercialStatus).toBe('CANCELLED')

    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      include: { currentVersion: true },
    })
    expect(quote?.status).toBe('DECLINED')
    expect(quote?.currentVersion?.declineReason).toBe('PRICE')

    const r2 = await declineQuote(quoteId, 'PRICE')
    expect(r2.alreadyDeclined).toBe(true)
  })

  it('revise: current version SUPERSEDED, new DRAFT copies lines, project NEGOTIATION', async () => {
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
    expect(project?.lifecycleStatus).toBe('NEGOTIATION')
  })

  it('an accepted quote cannot be revised', async () => {
    const { quoteId } = await sentQuote()

    const q = await prisma.quote.findUnique({ where: { id: quoteId } })
    await prisma.quoteVersion.update({
      where: { id: q!.currentVersionId! },
      data: { status: 'ACCEPTED' },
    })
    await expect(reviseQuote(quoteId)).rejects.toThrow()
  })
})
