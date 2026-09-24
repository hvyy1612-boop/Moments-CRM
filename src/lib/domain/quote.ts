import { randomBytes } from 'node:crypto'
import { Prisma, type DeclineReason } from '@prisma/client'
import { prisma } from '@/lib/db'
import { systemClock } from '@/lib/time'
import type { QuoteLineInput } from '@/lib/validation/quote'
import { convertEnquiryCore } from './enquiry'

const GST_DIVISOR = new Prisma.Decimal(11)
const ROUND_HALF_UP = 4 // Decimal.js rounding mode; money rounds half up (BR-X03)

/** Prices are GST inclusive (BR-P01/P02): total is what the client pays, GST is total / 11. */
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

/** Create a quote for a project with an empty draft version 1; sets commercial status QUOTED. */
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
    // Quoting moves the COMMERCIAL axis only - never the operational lifecycle: a booked job stays
    // booked while you quote extras (docs/24 Increment 1).
    await tx.project.update({
      where: { id: projectId },
      data: { commercialStatus: 'QUOTED' },
    })
    return { quoteId: quote.id, versionId: version.id }
  })
}

/** Replace the draft version's lines and recompute totals. Only a DRAFT version may be edited. */
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

/** Send the current draft version: lock it to SENT. Operational lifecycle is unchanged. */
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
    // Sending a quote does not touch the operational lifecycle (docs/24 Increment 1).
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
// acceptQuoteByToken was RETIRED here (docs/31 section 7): the /quote/[token] page is view-only and
// staff accept via acceptQuote(); the old client-token action + QuoteAccept form were removed, since
// accepting an enquiry-stage quote by token created no Job and permanently deadlocked the enquiry.

/**
 * Client (or staff) declines the current quote with a reason (F-QUOTE-03). The version → DECLINED,
 * recording the reason. The job is NOT lost by a declined quote - abandoning a job is an explicit
 * cancelJob() decision (docs/24 Increment 1). Idempotent if already declined.
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
    // A declined quote is a quote-level fact; it does not lose the job (docs/24 Increment 1).
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
 * DRAFT version (copying the lines) becomes current. Operational lifecycle is unchanged. An accepted
 * quote is immutable - a change there goes through a change request instead.
 */
export async function reviseQuote(quoteId: string, actorUserId: string | null = null) {
  return prisma.$transaction((tx) => reviseQuoteTx(tx, quoteId, actorUserId))
}

type QuoteTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/**
 * Transaction-aware core of {@link reviseQuote}: copies the current version into a new DRAFT, supersedes
 * the old one, and points the quote at it. Callers pass their own transaction so a Change Request can
 * revise the quote for client review inside its single apply transaction (docs/25 Rule C5).
 *
 * By default an ACCEPTED version cannot be revised (staff must raise a change request). The Change
 * Request scope-change path passes `allowFromAccepted` — revising the agreed quote for the client to
 * review is exactly what a CR does (Rule C1: this creates a draft to review, it is not application).
 */
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
  // Revising a quote is a commercial/quote-level action; operational lifecycle is unchanged
  // (docs/24 Increment 1).
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

// ── docs/31: Enquiry-stage quotes (Studio-Ninja model) ─────────────────────────────────────────────

/** Display number for a quote, e.g. seq 23 → "Q-0023". */
export function formatQuoteNumber(seq: number | null | undefined): string {
  return seq ? `Q-${String(seq).padStart(4, '0')}` : 'Q-draft'
}

/** The quote's shown ID: the staff-entered reference if set, else the auto Q-seq number. */
export function quoteDisplayNumber(reference: string | null | undefined, seq: number | null | undefined): string {
  return reference && reference.trim() ? reference.trim() : formatQuoteNumber(seq)
}

/**
 * Create a quote that belongs to an ENQUIRY (docs/31): the canonical path. No Project is created — the
 * quote lives on the lead until it is accepted. Assigns the next per-company sequential number and an
 * empty DRAFT version 1.
 */
export async function createQuoteForEnquiry(enquiryId: string, createdByUserId: string | null) {
  return prisma.$transaction(async (tx) => {
    const enquiry = await tx.enquiry.findUnique({ where: { id: enquiryId }, select: { id: true, status: true } })
    if (!enquiry) throw new Error('Enquiry not found.')
    if (enquiry.status === 'LOST' || enquiry.status === 'ARCHIVED') throw new Error('Reopen the enquiry before quoting it.')
    const agg = await tx.quote.aggregate({ _max: { seq: true } })
    const seq = (agg._max.seq ?? 0) + 1
    const quote = await tx.quote.create({
      data: {
        enquiryId: enquiry.id,
        seq,
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

/**
 * Accept a quote (docs/31): the single controlled transition that turns the Enquiry into a Job. Staff
 * command (app is staff-only). ONE transaction: mark ACCEPTED + freeze the version, supersede sibling
 * quotes, convert the enquiry (idempotent) into a Job, and link both ways. Retries on the per-year
 * project-code unique collision, same as convertEnquiry. Any failure rolls the whole thing back.
 */
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

        // Accept + freeze this quote/version.
        await tx.quoteVersion.update({ where: { id: version.id }, data: { status: 'ACCEPTED', acceptedByClientAt: now } })
        await tx.quote.update({ where: { id: quote.id }, data: { status: 'ACCEPTED' } })
        // Supersede the enquiry's other open quotes (never edited in place).
        await tx.quote.updateMany({
          where: { enquiryId: quote.enquiryId, NOT: { id: quote.id }, status: { in: ['DRAFT', 'SENT', 'VIEWED'] } },
          data: { status: 'SUPERSEDED' },
        })

        // Convert the enquiry into a Job (idempotent) and link both ways.
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

/**
 * Effective (display) status: a non-accepted quote past its valid-until date reads as EXPIRED (docs/31).
 * Accepted/declined/superseded quotes never become expired. This is a pure derivation over the stored
 * status — the backend is the source of truth; acceptQuote enforces the same rule server-side.
 */
export function effectiveQuoteStatus(status: string, validUntil: Date | null, now: Date = systemClock.now()): QuoteStatusValue {
  if ((status === 'DRAFT' || status === 'SENT' || status === 'VIEWED') && validUntil && validUntil.getTime() < now.getTime()) {
    return 'EXPIRED'
  }
  return status as QuoteStatusValue
}

/** All quotes for the Quotes list, newest first. Dual-reads the client from the enquiry (new) or the
 *  project (legacy) during the migration window (docs/31). Status reflects derived expiry. */
export async function listQuotes(): Promise<QuoteListRow[]> {
  const now = systemClock.now()
  const quotes = await prisma.quote.findMany({
    orderBy: [{ seq: 'desc' }, { createdAt: 'desc' }],
    include: {
      currentVersion: { select: { total: true, updatedAt: true, validUntil: true } },
      enquiry: { select: { name: true, client: { select: { displayName: true } } } },
      project: { select: { client: { select: { displayName: true } } } },
    },
  })
  return quotes.map((q) => ({
    id: q.id,
    number: quoteDisplayNumber(q.reference, q.seq),
    clientName: q.enquiry?.client?.displayName ?? q.enquiry?.name ?? q.project?.client?.displayName ?? 'Unknown',
    total: q.currentVersion?.total ?? new Prisma.Decimal(0),
    status: effectiveQuoteStatus(q.status, q.currentVersion?.validUntil ?? null, now),
    updatedAt: q.currentVersion?.updatedAt ?? q.updatedAt,
  }))
}

/**
 * Duplicate a quote as a fresh DRAFT (docs/31): copies the commercial line snapshots + presentation +
 * payment terms and the enquiry association, with a new number and view token. Never copies lifecycle
 * metadata (sent/viewed/accepted, status history, contract/invoice links).
 */
export async function duplicateQuote(quoteId: string, actorUserId: string | null = null) {
  return prisma.$transaction(async (tx) => {
    const src = await tx.quote.findUnique({
      where: { id: quoteId },
      include: { currentVersion: { include: { lines: { orderBy: { sortOrder: 'asc' } } } } },
    })
    if (!src || !src.currentVersion) throw new Error('Quote not found.')
    const v = src.currentVersion
    const agg = await tx.quote.aggregate({ _max: { seq: true } })
    const seq = (agg._max.seq ?? 0) + 1
    const copy = await tx.quote.create({
      data: {
        enquiryId: src.enquiryId,
        projectId: src.projectId, // keep the same association; not the accepted-quote link
        seq,
        viewToken: randomBytes(24).toString('base64url'),
        status: 'DRAFT',
        versions: {
          create: {
            versionNumber: 1,
            status: 'DRAFT',
            currency: v.currency,
            subtotal: v.subtotal,
            discountTotal: v.discountTotal,
            taxTotal: v.taxTotal,
            total: v.total,
            validUntil: v.validUntil,
            introduction: v.introduction,
            poNumber: v.poNumber,
            notes: v.notes,
            depositPercent: v.depositPercent,
            createdByUserId: actorUserId,
          },
        },
      },
      include: { versions: true },
    })
    const newVersion = copy.versions[0]!
    if (v.lines.length > 0) {
      await tx.quoteLine.createMany({
        data: v.lines.map((line) => ({
          quoteVersionId: newVersion.id,
          lineType: line.lineType,
          referenceId: line.referenceId,
          description: line.description,
          details: line.details,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discount: line.discount,
          tax: line.tax,
          lineTotal: line.lineTotal,
          sortOrder: line.sortOrder,
        })),
      })
    }
    await tx.quote.update({ where: { id: copy.id }, data: { currentVersionId: newVersion.id } })
    await tx.auditLog.create({
      data: { action: 'quote.duplicated', entityType: 'Quote', entityId: copy.id, actorUserId, afterData: { fromQuoteId: quoteId, seq } },
    })
    return { quoteId: copy.id, versionId: newVersion.id }
  })
}
