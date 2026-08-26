import { randomBytes } from 'node:crypto'
import { Prisma, type DeclineReason } from '@prisma/client'
import { prisma } from '@/lib/db'
import { systemClock } from '@/lib/time'
import type { QuoteLineInput } from '@/lib/validation/quote'

const GST_DIVISOR = new Prisma.Decimal(11)
const ROUND_HALF_UP = 4 // Decimal.js rounding mode; money rounds half up (BR-X03)

/** Prices are GST inclusive (BR-P01/P02): total is what the client pays, GST is total / 11. */
function computeTotals(lines: QuoteLineInput[]) {
  let total = new Prisma.Decimal(0)
  const computed = lines.map((line, index) => {
    const lineTotal = new Prisma.Decimal(line.unitPrice).mul(line.quantity)
    total = total.add(lineTotal)
    return {
      description: line.description,
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

/** Create a quote for a project with an empty draft version 1, and move the project to QUOTING. */
export async function createQuote(projectId: string, createdByUserId: string | null) {
  return prisma.$transaction(async (tx) => {
    const quote = await tx.quote.create({
      data: {
        projectId,
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
      data: { lifecycleStatus: 'QUOTING', commercialStatus: 'QUOTED' },
    })
    return { quoteId: quote.id, versionId: version.id }
  })
}

/** Replace the draft version's lines and recompute totals. Only a DRAFT version may be edited. */
export async function saveQuoteDraft(
  versionId: string,
  lines: QuoteLineInput[],
  validUntil: Date | null,
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
      data: { subtotal, taxTotal, total, validUntil },
    })
    return { subtotal, taxTotal, total }
  })
}

/** Send the current draft version: lock it to SENT and move the project to AWAITING_DECISION. */
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
    if (version.total.lessThanOrEqualTo(0)) throw new Error('Add at least one line before sending.')

    await tx.quoteVersion.update({ where: { id: version.id }, data: { status: 'SENT', sentToClientAt: now } })
    await tx.quote.update({ where: { id: quoteId }, data: { status: 'SENT' } })
    await tx.project.update({
      where: { id: quote.projectId },
      data: { lifecycleStatus: 'AWAITING_DECISION' },
    })
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

/** Record that the client opened the quote link (SENT to VIEWED). Best-effort, never throws. */
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

/** Client accepts the current version by token. Guards expiry and status; idempotent if re-accepted. */
export async function acceptQuoteByToken(viewToken: string, acceptedName: string, ip: string) {
  const now = systemClock.now()
  return prisma.$transaction(async (tx) => {
    const quote = await tx.quote.findUnique({
      where: { viewToken },
      include: { currentVersion: true },
    })
    if (!quote || !quote.currentVersion) throw new Error('Quote not found.')
    const version = quote.currentVersion
    if (version.status === 'ACCEPTED') return { alreadyAccepted: true }
    if (version.status !== 'SENT' && version.status !== 'VIEWED') {
      throw new Error('This quote cannot be accepted.')
    }
    if (version.validUntil && version.validUntil < now) throw new Error('This quote has expired.')

    await tx.quoteVersion.update({
      where: { id: version.id },
      data: {
        status: 'ACCEPTED',
        acceptedByClientAt: now,
        acceptedByClientName: acceptedName,
        acceptedByClientIp: ip,
      },
    })
    await tx.quote.update({ where: { id: quote.id }, data: { status: 'ACCEPTED' } })
    await tx.project.update({
      where: { id: quote.projectId },
      data: { commercialStatus: 'ACCEPTED' },
    })
    await tx.auditLog.create({
      data: {
        action: 'quote.accepted',
        entityType: 'Quote',
        entityId: quote.id,
        source: 'client.quote',
        afterData: { acceptedName },
      },
    })
    await tx.outboxEvent.create({
      data: {
        eventType: 'quote.accepted',
        aggregateType: 'Quote',
        aggregateId: quote.id,
        payload: { quoteId: quote.id, projectId: quote.projectId },
      },
    })
    return { alreadyAccepted: false }
  })
}

/**
 * Client (or staff) declines the current quote with a reason (F-QUOTE-03). The version → DECLINED and
 * the project → LOST (commercial CANCELLED), recording the reason. Idempotent if already declined.
 */
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
  const now = systemClock.now()
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
    await tx.project.update({
      where: { id: quote.projectId },
      data: {
        lifecycleStatus: 'LOST',
        commercialStatus: 'CANCELLED',
        lostReason: reason,
        lostAt: now,
      },
    })
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

/**
 * Client requests changes / staff revises (F-QUOTE-04). The current version is SUPERSEDED and a new
 * DRAFT version (copying the lines) becomes current; the project moves to NEGOTIATION. An accepted
 * quote is immutable - a change there goes through a change request instead.
 */
export async function reviseQuote(quoteId: string, actorUserId: string | null = null) {
  return prisma.$transaction(async (tx) => {
    const quote = await tx.quote.findUnique({
      where: { id: quoteId },
      include: { currentVersion: { include: { lines: { orderBy: { sortOrder: 'asc' } } } } },
    })
    if (!quote || !quote.currentVersion) throw new Error('Quote not found.')
    const current = quote.currentVersion
    if (current.status === 'ACCEPTED') {
      throw new Error('An accepted quote cannot be revised; raise a change request.')
    }

    const agg = await tx.quoteVersion.aggregate({
      where: { quoteId },
      _max: { versionNumber: true },
    })
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
    await tx.quote.update({
      where: { id: quoteId },
      data: { currentVersionId: newVersion.id, status: 'DRAFT' },
    })
    await tx.project.update({
      where: { id: quote.projectId },
      data: { lifecycleStatus: 'NEGOTIATION' },
    })
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
  })
}
