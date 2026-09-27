import { randomBytes } from 'node:crypto'
import { Prisma, type DeclineReason } from '@prisma/client'
import { prisma } from '@/lib/db'
import { systemClock } from '@/lib/time'
import type { QuoteLineInput } from '@/lib/validation/quote'
import { convertEnquiryCore } from './enquiry'
import { nextRecordNumber } from './numbering'

const GST_DIVISOR = new Prisma.Decimal(11)
const ROUND_HALF_UP = 4

function computeTotals(lines: QuoteLineInput[]) {
  let total = new Prisma.Decimal(0)
  const computed = lines.map((line, index) => {
    const lineTotal = new Prisma.Decimal(line.unitPrice).mul(line.quantity)
    total = total.add(lineTotal)
    return {
      lineType: line.lineType ?? 'custom',
      referenceId: line.referenceId ?? null,
      description: line.description,
      details: line.details ?? null,
      quantity: line.quantity,
      unitPrice: new Prisma.Decimal(line.unitPrice),
      lineTotal,
      sortOrder: index,
    }
  })
  const taxTotal = total.div(GST_DIVISOR).toDecimalPlaces(2, ROUND_HALF_UP)
  const subtotal = total.sub(taxTotal)
  return { computed, subtotal, taxTotal, total }
}

export async function createQuote(projectId: string, createdByUserId: string | null) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({ where: { id: projectId }, select: { companyId: true } })
    if (!project) throw new Error('Project not found.')
    const quote = await tx.quote.create({
      data: {
        projectId,
        reference: await nextRecordNumber(tx, project.companyId, 'QUOTE'),
        viewToken: randomBytes(24).toString('base64url'),
        status: 'DRAFT',
        versions: { create: { versionNumber: 1, status: 'DRAFT', createdByUserId } },
      },
      include: { versions: true },
    })
    const version = quote.versions[0]
    if (!version) throw new Error('Quote version was not created.')
    await tx.quote.update({ where: { id: quote.id }, data: { currentVersionId: version.id } })

    await tx.project.update({
      where: { id: projectId },
      data: { commercialStatus: 'QUOTED' },
    })
    return { quoteId: quote.id, versionId: version.id }
  })
}

export type QuotePresentation = {
  introduction?: string | null
  poNumber?: string | null
  notes?: string | null
  depositPercent?: number | null
  issueDate?: Date | null
  reference?: string | null
}

export async function saveQuoteDraft(
  versionId: string,
  lines: QuoteLineInput[],
  validUntil: Date | null,
  presentation: QuotePresentation = {},
) {
  const { computed, subtotal, taxTotal, total } = computeTotals(lines)
  return prisma.$transaction(async (tx) => {
    const version = await tx.quoteVersion.findUnique({ where: { id: versionId } })
    if (!version) throw new Error('Quote version not found.')
    if (version.status !== 'DRAFT') throw new Error('Only a draft quote can be edited.')

    await tx.quoteLine.deleteMany({ where: { quoteVersionId: versionId } })
    await tx.quoteLine.createMany({
      data: computed.map((line) => ({ quoteVersionId: versionId, ...line })),
    })
    await tx.quoteVersion.update({
      where: { id: versionId },
      data: {
        subtotal,
        taxTotal,
        total,
        validUntil,
        introduction: presentation.introduction ?? null,
        poNumber: presentation.poNumber ?? null,
        notes: presentation.notes ?? null,
        depositPercent: presentation.depositPercent ?? null,
        issueDate: presentation.issueDate ?? null,
      },
    })
    if (presentation.reference !== undefined) {
      await tx.quote.update({ where: { id: version.quoteId }, data: { reference: presentation.reference } })
    }
    return { subtotal, taxTotal, total }
  })
}

export async function sendQuote(quoteId: string, actorUserId: string | null) {
  const now = systemClock.now()
  return prisma.$transaction(async (tx) => {
    const quote = await tx.quote.findUnique({
      where: { id: quoteId },
      include: { currentVersion: true },
    })
    if (!quote || !quote.currentVersion) throw new Error('Quote not found.')
    const version = quote.currentVersion
    if (version.status !== 'DRAFT') throw new Error('This quote has already been sent.')
    if (version.total.lessThanOrEqualTo(0)) throw new Error('This quote has no items yet. Add a package or add-on to the quote before sending it.')

    await tx.quoteVersion.update({ where: { id: version.id }, data: { status: 'SENT', sentToClientAt: now } })
    await tx.quote.update({ where: { id: quoteId }, data: { status: 'SENT' } })

    await tx.auditLog.create({
      data: { action: 'quote.sent', entityType: 'Quote', entityId: quoteId, actorUserId },
    })
    await tx.outboxEvent.create({
      data: {
        eventType: 'quote.sent',
        aggregateType: 'Quote',
        aggregateId: quoteId,
        payload: { quoteId, viewToken: quote.viewToken },
      },
    })
    return { viewToken: quote.viewToken }
  })
}

export async function markQuoteViewed(viewToken: string) {
  const now = systemClock.now()
  const quote = await prisma.quote.findUnique({
    where: { viewToken },
    include: { currentVersion: true },
  })
  if (quote?.currentVersion?.status === 'SENT') {
    await prisma.quoteVersion.update({
      where: { id: quote.currentVersion.id },
      data: { status: 'VIEWED', viewedByClientAt: now },
    })
  }
}

export async function declineQuote(
  quoteId: string,
  reason: DeclineReason,
  actorUserId: string | null = null,
) {
  return runDeclineQuote({ id: quoteId }, reason, actorUserId, 'staff.quote')
}

export async function declineQuoteByToken(viewToken: string, reason: DeclineReason) {
  return runDeclineQuote({ viewToken }, reason, null, 'client.quote')
}

async function runDeclineQuote(
  where: Prisma.QuoteWhereUniqueInput,
  reason: DeclineReason,
  actorUserId: string | null,
  source: string,
) {
  return prisma.$transaction(async (tx) => {
    const quote = await tx.quote.findUnique({ where, include: { currentVersion: true } })
    if (!quote || !quote.currentVersion) throw new Error('Quote not found.')
    const version = quote.currentVersion
    if (version.status === 'DECLINED') return { alreadyDeclined: true }
    if (version.status === 'ACCEPTED') throw new Error('An accepted quote cannot be declined.')
    if (version.status !== 'SENT' && version.status !== 'VIEWED') {
      throw new Error('This quote cannot be declined.')
    }

    await tx.quoteVersion.update({
      where: { id: version.id },
      data: { status: 'DECLINED', declineReason: reason },
    })
    await tx.quote.update({ where: { id: quote.id }, data: { status: 'DECLINED' } })

    await tx.auditLog.create({
      data: {
        action: 'quote.declined',
        entityType: 'Quote',
        entityId: quote.id,
        actorUserId,
        source,
        afterData: { reason },
      },
    })
    await tx.outboxEvent.create({
      data: {
        eventType: 'quote.declined',
        aggregateType: 'Quote',
        aggregateId: quote.id,
        payload: { quoteId: quote.id, projectId: quote.projectId, reason },
      },
    })
    return { alreadyDeclined: false }
  })
}

export async function reviseQuote(quoteId: string, actorUserId: string | null = null) {
  return prisma.$transaction((tx) => reviseQuoteTx(tx, quoteId, actorUserId))
}

type QuoteTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

export async function reviseQuoteTx(
  tx: QuoteTx,
  quoteId: string,
  actorUserId: string | null = null,
  opts: { allowFromAccepted?: boolean } = {},
) {
  const quote = await tx.quote.findUnique({
    where: { id: quoteId },
    include: { currentVersion: { include: { lines: { orderBy: { sortOrder: 'asc' } } } } },
  })
  if (!quote || !quote.currentVersion) throw new Error('Quote not found.')
  const current = quote.currentVersion
  if (current.status === 'ACCEPTED' && !opts.allowFromAccepted) {
    throw new Error('An accepted quote cannot be revised; raise a change request.')
  }

  const agg = await tx.quoteVersion.aggregate({ where: { quoteId }, _max: { versionNumber: true } })
  const nextNumber = (agg._max.versionNumber ?? 0) + 1

  const newVersion = await tx.quoteVersion.create({
    data: {
      quoteId,
      versionNumber: nextNumber,
      status: 'DRAFT',
      currency: current.currency,
      subtotal: current.subtotal,
      discountTotal: current.discountTotal,
      taxTotal: current.taxTotal,
      total: current.total,
      validUntil: current.validUntil,
      createdByUserId: actorUserId,
    },
  })
  if (current.lines.length > 0) {
    await tx.quoteLine.createMany({
      data: current.lines.map((line) => ({
        quoteVersionId: newVersion.id,
        lineType: line.lineType,
        referenceId: line.referenceId,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discount: line.discount,
        tax: line.tax,
        lineTotal: line.lineTotal,
        sortOrder: line.sortOrder,
      })),
    })
  }
  await tx.quoteVersion.update({ where: { id: current.id }, data: { status: 'SUPERSEDED' } })
  await tx.quote.update({ where: { id: quoteId }, data: { currentVersionId: newVersion.id, status: 'DRAFT' } })

  await tx.auditLog.create({
    data: {
      action: 'quote.revised',
      entityType: 'Quote',
      entityId: quoteId,
      actorUserId,
      afterData: { newVersion: nextNumber },
    },
  })
  return { quoteId, versionId: newVersion.id, versionNumber: nextNumber }
}

export function formatQuoteNumber(seq: number | null | undefined): string {
  return seq ? `Q-${String(seq).padStart(4, '0')}` : 'Q-draft'
}

export function quoteDisplayNumber(reference: string | null | undefined, seq: number | null | undefined): string {
  return reference && reference.trim() ? reference.trim() : formatQuoteNumber(seq)
}

export async function createQuoteForEnquiry(enquiryId: string, createdByUserId: string | null) {
  return prisma.$transaction(async (tx) => {
    const enquiry = await tx.enquiry.findUnique({ where: { id: enquiryId }, select: { id: true, status: true, companyId: true } })
    if (!enquiry) throw new Error('Enquiry not found.')
    if (enquiry.status === 'LOST' || enquiry.status === 'ARCHIVED') throw new Error('Reopen the enquiry before quoting it.')
    const agg = await tx.quote.aggregate({ _max: { seq: true } })
    const seq = (agg._max.seq ?? 0) + 1
    const quote = await tx.quote.create({
      data: {
        enquiryId: enquiry.id,
        seq,
        reference: await nextRecordNumber(tx, enquiry.companyId, 'QUOTE'),
        viewToken: randomBytes(24).toString('base64url'),
        status: 'DRAFT',
        versions: { create: { versionNumber: 1, status: 'DRAFT', createdByUserId } },
      },
      include: { versions: true },
    })
    const version = quote.versions[0]
    if (!version) throw new Error('Quote version was not created.')
    await tx.quote.update({ where: { id: quote.id }, data: { currentVersionId: version.id } })
    await tx.auditLog.create({
      data: { action: 'quote.created', entityType: 'Quote', entityId: quote.id, actorUserId: createdByUserId, afterData: { enquiryId: enquiry.id, seq } },
    })
    return { quoteId: quote.id, versionId: version.id }
  })
}

export async function acceptQuote(quoteId: string, actorUserId: string | null = null) {
  const now = systemClock.now()
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const quote = await tx.quote.findUnique({ where: { id: quoteId }, include: { currentVersion: true, enquiry: true } })
        if (!quote) throw new Error('Quote not found.')
        if (!quote.enquiryId || !quote.enquiry) throw new Error('This quote is not linked to an enquiry.')
        const version = quote.currentVersion
        if (!version) throw new Error('This quote has no version to accept.')
        if (quote.status !== 'SENT' && quote.status !== 'VIEWED') throw new Error('Only a sent quote can be accepted.')
        if (version.total.lessThanOrEqualTo(0)) throw new Error('Add at least one line before accepting.')
        if (version.validUntil && version.validUntil.getTime() < now.getTime()) throw new Error('This quote has expired; revise it before accepting.')
        if (quote.enquiry.status === 'LOST' || quote.enquiry.status === 'ARCHIVED') throw new Error('Reopen the enquiry before accepting a quote.')

        const otherAccepted = await tx.quote.findFirst({ where: { enquiryId: quote.enquiryId, status: 'ACCEPTED', NOT: { id: quote.id } }, select: { id: true } })
        if (otherAccepted) throw new Error('Another quote on this enquiry has already been accepted.')

        await tx.quoteVersion.update({ where: { id: version.id }, data: { status: 'ACCEPTED', acceptedByClientAt: now } })
        await tx.quote.update({ where: { id: quote.id }, data: { status: 'ACCEPTED' } })

        await tx.quote.deleteMany({
          where: { enquiryId: quote.enquiryId, NOT: { id: quote.id }, status: { in: ['DRAFT', 'SENT', 'VIEWED'] } },
        })

        const conv = await convertEnquiryCore(tx, quote.enquiryId, actorUserId, now)
        if (!conv.projectId) throw new Error('Converting the enquiry did not produce a job.')
        await tx.project.update({ where: { id: conv.projectId }, data: { sourceQuoteId: quote.id, commercialStatus: 'ACCEPTED' } })
        await tx.quote.update({ where: { id: quote.id }, data: { projectId: conv.projectId } })

        await tx.auditLog.create({ data: { action: 'quote.accepted', entityType: 'Quote', entityId: quote.id, actorUserId, afterData: { enquiryId: quote.enquiryId, projectId: conv.projectId } } })
        await tx.outboxEvent.create({ data: { eventType: 'quote.accepted', aggregateType: 'Quote', aggregateId: quote.id, payload: { quoteId: quote.id, enquiryId: quote.enquiryId, projectId: conv.projectId } } })
        return { quoteId: quote.id, projectId: conv.projectId }
      })
    } catch (error) {
      const isUnique = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
      if (isUnique && attempt < 4) continue
      throw error
    }
  }
}

export type QuoteListRow = {
  id: string
  number: string
  clientName: string
  total: Prisma.Decimal
  status: QuoteStatusValue
  updatedAt: Date
}
type QuoteStatusValue = 'DRAFT' | 'SENT' | 'VIEWED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'SUPERSEDED'

export function effectiveQuoteStatus(status: string, validUntil: Date | null, now: Date = systemClock.now()): QuoteStatusValue {
  if ((status === 'DRAFT' || status === 'SENT' || status === 'VIEWED') && validUntil && validUntil.getTime() < now.getTime()) {
    return 'EXPIRED'
  }
  return status as QuoteStatusValue
}

export async function listQuotes(): Promise<QuoteListRow[]> {
  const quotes = await prisma.quote.findMany({
    orderBy: [{ seq: 'desc' }, { createdAt: 'desc' }],
    include: {
      currentVersion: { select: { total: true, updatedAt: true } },
      enquiry: { select: { name: true, client: { select: { displayName: true } } } },
      project: { select: { client: { select: { displayName: true } } } },
    },
  })
  return quotes.map((q) => ({
    id: q.id,
    number: quoteDisplayNumber(q.reference, q.seq),
    clientName: q.enquiry?.client?.displayName ?? q.enquiry?.name ?? q.project?.client?.displayName ?? 'Unknown',
    total: q.currentVersion?.total ?? new Prisma.Decimal(0),

    status: q.status,
    updatedAt: q.currentVersion?.updatedAt ?? q.updatedAt,
  }))
}

export async function deleteQuotes(ids: string[]): Promise<{ deleted: number; skipped: number }> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return { deleted: 0, skipped: 0 }
  const quotes = await prisma.quote.findMany({
    where: { id: { in: unique } },
    select: { id: true, status: true, projectId: true, sourcedProject: { select: { id: true } } },
  })
  const deletable = quotes
    .filter((q) => q.status !== 'ACCEPTED' && !q.projectId && !q.sourcedProject)
    .map((q) => q.id)
  if (deletable.length > 0) {
    await prisma.quote.deleteMany({ where: { id: { in: deletable } } })
  }
  return { deleted: deletable.length, skipped: quotes.length - deletable.length }
}

