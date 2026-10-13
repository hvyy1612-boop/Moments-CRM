import { randomBytes } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { sydneyDateTimeParts, systemClock } from '@/lib/time'
import type { QuoteLineInput } from '@/lib/validation/quote'
import { convertEnquiryCore } from './enquiry'
import { nextRecordNumber } from './numbering'

const GST_DIVISOR = new Prisma.Decimal(11)
const ROUND_HALF_UP = 4 // Decimal.js rounding mode; money rounds half up (BR-X03)

/** Prices are GST inclusive (BR-P01/P02): total is what the client pays, GST is total / 11. */
function computeTotals(lines: QuoteLineInput[]) {
  let total = new Prisma.Decimal(0)
  const computed = lines.map((line, index) => {
    const gross = new Prisma.Decimal(line.unitPrice).mul(line.quantity)
    const discount = new Prisma.Decimal(line.discount ?? '0')
    // Line total is what the client pays for this line: gross minus the discount, never below zero.
    const net = gross.sub(discount)
    const lineTotal = net.lessThan(0) ? new Prisma.Decimal(0) : net
    total = total.add(lineTotal)
    return {
      lineType: line.lineType ?? 'custom',
      referenceId: line.referenceId ?? null,
      description: line.description,
      details: line.details ?? null,
      quantity: line.quantity,
      unitPrice: new Prisma.Decimal(line.unitPrice),
      discount,
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
    // Quoting moves the COMMERCIAL axis only - never the operational lifecycle - and only forward: a job
    // that is already accepted, paid or cancelled keeps its status while staff quote extras.
    await tx.project.updateMany({ where: { id: projectId, commercialStatus: 'UNQUOTED' }, data: { commercialStatus: 'QUOTED' } })
    return { quoteId: quote.id, versionId: version.id }
  })
}

/** Replace the draft version's lines and recompute totals. Only a DRAFT version may be edited. */
export type QuotePresentation = {
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
    if (version.total.lessThanOrEqualTo(0)) throw new Error('This quote has no items yet. Add a package or add-on to the quote before sending it.')
    if (quoteValidityPassed(version.validUntil, now)) throw new Error('The "valid until" date has passed. Choose a later date before sending the quote.')

    await tx.quoteVersion.update({ where: { id: version.id }, data: { status: 'SENT', sentToClientAt: now } })
    await tx.quote.update({ where: { id: quoteId }, data: { status: 'SENT' } })
    // Actually sending the quote is the business event that moves the enquiry to "Quote sent" (spec §6):
    // preparing a draft never does. Forward-only - only an open, pre-quote lead is advanced.
    if (quote.enquiryId) {
      const enq = await tx.enquiry.findUnique({ where: { id: quote.enquiryId }, select: { status: true, companyId: true } })
      if (enq && ['NEW_ENQUIRY', 'CONTACTED', 'CONSULTATION'].includes(enq.status)) {
        await tx.enquiry.update({ where: { id: quote.enquiryId }, data: { status: 'QUOTE_SENT' } })
        await tx.auditLog.create({
          data: { companyId: enq.companyId, actorUserId, action: 'enquiry.stage_auto', entityType: 'Enquiry', entityId: quote.enquiryId, beforeData: { status: enq.status }, afterData: { status: 'QUOTE_SENT' } },
        })
      }
    }
    // Sending a quote does not touch the operational lifecycle (docs/24 Increment 1).
    await tx.auditLog.create({
      data: { action: 'quote.sent', entityType: 'Quote', entityId: quoteId, actorUserId },
    })
    return { viewToken: quote.viewToken }
  })
}

/** Record that the client opened the quote link (SENT to VIEWED). Best-effort, never throws. */
/**
 * The version the client's link shows: the current one, except while staff are revising a sent quote (the
 * current version is then a DRAFT) - the client keeps seeing the last version they were actually sent
 * until the new one is sent (owner decision 2026-10-05). Null when nothing was ever sent.
 */
export async function clientVisibleQuoteVersionId(quoteId: string): Promise<string | null> {
  const quote = await prisma.quote.findUnique({ where: { id: quoteId }, select: { currentVersion: { select: { id: true, status: true } } } })
  if (quote?.currentVersion && quote.currentVersion.status !== 'DRAFT') return quote.currentVersion.id
  const sent = await prisma.quoteVersion.findFirst({
    where: { quoteId, sentToClientAt: { not: null } },
    orderBy: { versionNumber: 'desc' },
    select: { id: true },
  })
  return sent?.id ?? null
}

export async function markQuoteViewed(viewToken: string) {
  const quote = await prisma.quote.findUnique({
    where: { viewToken },
    include: { currentVersion: true },
  })
  if (quote?.currentVersion?.status === 'SENT') {
    await prisma.quoteVersion.update({
      where: { id: quote.currentVersion.id },
      data: { status: 'VIEWED' },
    })
  }
}

/** Client accepts the current version by token. Guards expiry and status; idempotent if re-accepted. */
// acceptQuoteByToken was RETIRED here (docs/31 section 7): the /quote/[token] page is view-only and
// staff accept via acceptQuote(); the old client-token action + QuoteAccept form were removed, since
// accepting an enquiry-stage quote by token created no Job and permanently deadlocked the enquiry.

/**
 * Staff record that the client declined the current quote (F-QUOTE-03): the version and the quote become
 * DECLINED. A declined quote is a quote-level fact - it never declines the lead or cancels a job (docs/24
 * Increment 1). Idempotent if already declined.
 */
export async function declineQuote(quoteId: string, actorUserId: string | null = null) {
  return prisma.$transaction(async (tx) => {
    const quote = await tx.quote.findUnique({ where: { id: quoteId }, include: { currentVersion: true } })
    if (!quote || !quote.currentVersion) throw new Error('Quote not found.')
    const version = quote.currentVersion
    if (version.status === 'DECLINED') return { alreadyDeclined: true }
    if (version.status === 'ACCEPTED') throw new Error('An accepted quote cannot be declined.')
    if (version.status !== 'SENT' && version.status !== 'VIEWED') {
      throw new Error('This quote cannot be declined.')
    }

    await tx.quoteVersion.update({
      where: { id: version.id },
      data: { status: 'DECLINED' },
    })
    await tx.quote.update({ where: { id: quote.id }, data: { status: 'DECLINED' } })
    // A declined quote is a quote-level fact; it does not lose the job (docs/24 Increment 1).
    await tx.auditLog.create({
      data: {
        action: 'quote.declined',
        entityType: 'Quote',
        entityId: quote.id,
        actorUserId,
        source: 'staff.quote',
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
      // The revision starts as an exact copy of what the client was sent - terms included - so editing
      // never silently drops the deposit %, notes, PO number or issue date.
      poNumber: current.poNumber,
      notes: current.notes,
      depositPercent: current.depositPercent,
      issueDate: current.issueDate,
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
        details: line.details, // package inclusions shown on the quote
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
    const enquiry = await tx.enquiry.findUnique({ where: { id: enquiryId }, select: { id: true, status: true, companyId: true } })
    if (!enquiry) throw new Error('Lead not found.')
    if (enquiry.status === 'DECLINED') throw new Error('Reopen the lead before quoting it.')
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

/**
 * Accept a quote (docs/31). Staff command (app is staff-only). ONE transaction: mark ACCEPTED + freeze the
 * version, supersede sibling quotes, open the lead's booking file (idempotent convert) and link both ways.
 * The lead moves to "Awaiting booking confirmation" and stays a lead; it becomes a Job only when the
 * deposit is paid (confirmBookingByDepositTx). Retries on the per-year
 * project-code unique collision, same as convertEnquiry. Any failure rolls the whole thing back.
 */
export async function acceptQuote(quoteId: string, actorUserId: string | null = null) {
  const now = systemClock.now()
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const quote = await tx.quote.findUnique({
          where: { id: quoteId },
          include: { currentVersion: true, enquiry: true, project: { select: { id: true, lifecycleStatus: true } } },
        })
        if (!quote) throw new Error('Quote not found.')
        const version = quote.currentVersion
        if (!version) throw new Error('This quote has no version to accept.')
        if (quote.status !== 'SENT' && quote.status !== 'VIEWED') throw new Error('Only a sent quote can be accepted.')
        if (version.total.lessThanOrEqualTo(0)) throw new Error('Add at least one line before accepting.')
        if (quoteValidityPassed(version.validUntil, now)) throw new Error('This quote has expired; revise it before accepting.')

        // A quote raised on an existing Job (Studio Ninja: the job's own quote) is accepted IN PLACE - there
        // is no lead to convert. One accepted quote per job: changing an agreed scope is a change request.
        if (!quote.enquiryId || !quote.enquiry) {
          const job = quote.project
          if (!job) throw new Error('This quote is not linked to a lead or a job.')
          if (job.lifecycleStatus === 'CANCELLED' || job.lifecycleStatus === 'CLOSED') throw new Error('This job is closed or cancelled, so its quote cannot be accepted.')
          const agreed = await tx.quote.findFirst({ where: { projectId: job.id, status: 'ACCEPTED', NOT: { id: quote.id } }, select: { id: true } })
          if (agreed) throw new Error('This job already has an accepted quote. Use a change request to change what was agreed.')
          await tx.quoteVersion.update({ where: { id: version.id }, data: { status: 'ACCEPTED', acceptedByClientAt: now } })
          await tx.quote.update({ where: { id: quote.id }, data: { status: 'ACCEPTED' } })
          // The job's other open quotes were alternatives to this one (same rule as on a lead).
          await tx.quote.deleteMany({ where: { projectId: job.id, enquiryId: null, NOT: { id: quote.id }, status: { in: ['DRAFT', 'SENT', 'VIEWED'] } } })
          // Commercial status only moves forward: a job already paid keeps "paid".
          await tx.project.updateMany({ where: { id: job.id, commercialStatus: { in: ['UNQUOTED', 'QUOTED'] } }, data: { commercialStatus: 'ACCEPTED' } })
          await tx.auditLog.create({ data: { action: 'quote.accepted', entityType: 'Quote', entityId: quote.id, actorUserId, afterData: { projectId: job.id } } })
          return { quoteId: quote.id, projectId: job.id, enquiryId: null }
        }
        if (quote.enquiry.status === 'DECLINED') throw new Error('Reopen the lead before accepting a quote.')

        const otherAccepted = await tx.quote.findFirst({ where: { enquiryId: quote.enquiryId, status: 'ACCEPTED', NOT: { id: quote.id } }, select: { id: true } })
        if (otherAccepted) throw new Error('Another quote on this lead has already been accepted.')

        // Accept + freeze this quote/version.
        await tx.quoteVersion.update({ where: { id: version.id }, data: { status: 'ACCEPTED', acceptedByClientAt: now } })
        await tx.quote.update({ where: { id: quote.id }, data: { status: 'ACCEPTED' } })
        // Once one quote is accepted, the enquiry's other OPEN quotes (draft/sent/viewed) are redundant
        // alternatives, so delete them (cascade to their versions/lines) rather than leaving them as
        // "superseded" clutter. Accepted/declined siblings are records and stay untouched.
        await tx.quote.deleteMany({
          where: { enquiryId: quote.enquiryId, NOT: { id: quote.id }, status: { in: ['DRAFT', 'SENT', 'VIEWED'] } },
        })

        // Convert the enquiry into a Job (idempotent) and link both ways.
        const conv = await convertEnquiryCore(tx, quote.enquiryId, actorUserId, now)
        if (!conv.projectId) throw new Error('Converting the lead did not produce a job.')
        await tx.project.update({ where: { id: conv.projectId }, data: { commercialStatus: 'ACCEPTED' } })
        await tx.quote.update({ where: { id: quote.id }, data: { projectId: conv.projectId } })

        await tx.auditLog.create({ data: { action: 'quote.accepted', entityType: 'Quote', entityId: quote.id, actorUserId, afterData: { enquiryId: quote.enquiryId, projectId: conv.projectId } } })
        return { quoteId: quote.id, projectId: conv.projectId, enquiryId: quote.enquiryId }
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
 * A quote is valid THROUGH its "valid until" day in Sydney: it only lapses once that calendar day is over,
 * not at the stored instant (a bare YYYY-MM-DD is stored as UTC midnight, which is mid-morning in Sydney).
 */
export function quoteValidityPassed(validUntil: Date | null, now: Date = systemClock.now()): boolean {
  return validUntil != null && sydneyDateTimeParts(now).date > sydneyDateTimeParts(validUntil).date
}

/** All quotes for the Quotes list, newest first. Dual-reads the client from the enquiry (new) or the
 *  project (legacy) during the migration window (docs/31). Status reflects derived expiry. */
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
    // Raw stored status - the UI (features/quotes/status.ts) folds it into the simplified Pending/Sent/
    // Accepted/Declined view. No auto-"expire" here.
    status: q.status,
    updatedAt: q.currentVersion?.updatedAt ?? q.updatedAt,
  }))
}

/**
 * Bulk-delete quotes from the list (batch action). Only quotes that are safe to remove are deleted: never
 * an ACCEPTED quote or one already tied to a Project - accepting a quote converts its enquiry into a Job,
 * so that quote is now part of a booking and must be kept. Deletion cascades to the quote's versions and
 * their lines (FK onDelete: Cascade); change-request history survives (its version refs are set null).
 * Returns how many were deleted vs skipped as protected, so the caller can tell the user.
 */
export async function deleteQuotes(ids: string[]): Promise<{ deleted: number; skipped: number }> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return { deleted: 0, skipped: 0 }
  const quotes = await prisma.quote.findMany({
    where: { id: { in: unique } },
    select: { id: true, status: true, projectId: true },
  })
  const deletable = quotes
    .filter((q) => q.status !== 'ACCEPTED' && !q.projectId)
    .map((q) => q.id)
  if (deletable.length > 0) {
    await prisma.quote.deleteMany({ where: { id: { in: deletable } } })
  }
  return { deleted: deletable.length, skipped: quotes.length - deletable.length }
}

