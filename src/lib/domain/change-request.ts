import { Prisma, type ChangeRequestType } from '@prisma/client'
import { prisma } from '@/lib/db'
import { splitGstInclusive } from '@/lib/money'
import { sydneyLocalToUtc, systemClock } from '@/lib/time'
import { changeRequestPayloadSchema, type ChangeRequestPayload } from '@/lib/validation/change-request'
import { rescheduleBookingTx } from './booking'
import { createInvoiceTx, issueCreditNoteTx } from './finance'
import { reviseQuoteTx } from './quote'

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

const APPROVAL_THRESHOLD = new Prisma.Decimal(500)

const TYPE_BY_KIND: Record<ChangeRequestPayload['kind'], ChangeRequestType> = {
  reschedule: 'OPERATIONAL',
  scopeChange: 'COMMERCIAL',
  priceDecrease: 'COMMERCIAL',
  clientData: 'CLIENT_DATA',
  production: 'PRODUCTION',
}

function describe(p: ChangeRequestPayload): string {
  switch (p.kind) {
    case 'reschedule':
      return `Reschedule shoot to ${p.newStartsAt}${p.fee ? ` (fee ${p.fee.amount})` : ''}`
    case 'scopeChange':
      return `Scope change: ${p.summary} (fee ${p.fee.amount})`
    case 'priceDecrease':
      return `Price decrease ${p.amount}${p.reason ? ` — ${p.reason}` : ''}`
    case 'clientData':
      return `Client data change: ${p.summary}`
    case 'production':
      return `Production revision: ${p.summary}`
  }
}

function commercialAmount(p: ChangeRequestPayload): Prisma.Decimal {
  if (p.kind === 'scopeChange') return new Prisma.Decimal(p.fee.amount)
  if (p.kind === 'reschedule' && p.fee) return new Prisma.Decimal(p.fee.amount)
  if (p.kind === 'priceDecrease') return new Prisma.Decimal(p.amount)
  return new Prisma.Decimal(0)
}

function requiresClientAgreement(p: ChangeRequestPayload): boolean {
  return p.kind === 'scopeChange' || (p.kind === 'reschedule' && Boolean(p.fee))
}

function parseSydney(local: string): Date {
  return sydneyLocalToUtc(local.includes('T') ? local : `${local}T00:00`)
}

async function assertChangeAllowed(tx: Tx, projectId: string, p: ChangeRequestPayload): Promise<void> {
  const project = await tx.project.findUnique({ where: { id: projectId }, select: { lifecycleStatus: true } })
  if (!project) throw new Error('Job not found.')
  if (project.lifecycleStatus === 'LOST') throw new Error('This job is lost; no change requests apply.')
  if (p.kind === 'reschedule') {
    if (project.lifecycleStatus === 'CANCELLED') throw new Error('A cancelled job has no shoot to reschedule.')
    const booking = await tx.booking.findUnique({ where: { id: p.bookingId }, select: { startsAt: true, status: true } })
    if (!booking) throw new Error('Booking not found.')
    if (booking.status === 'CANCELLED') throw new Error('That shoot was already cancelled or rescheduled.')
    if (booking.startsAt.getTime() < systemClock.now().getTime()) {
      throw new Error('That shoot has already happened; it cannot be rescheduled.')
    }
  }
  if ((p.kind === 'scopeChange' || p.kind === 'priceDecrease') && project.lifecycleStatus === 'CANCELLED') {
    throw new Error('A cancelled job cannot take a commercial change; track cancellation fees/refunds instead.')
  }
  // production is allowed even after COMPLETED/DELIVERED (revision policy), only blocked by LOST above.
}

export type CreateChangeRequestMeta = {
  requestedByType: 'staff' | 'client'
  requestedByUserId?: string | null
  reason?: string | null
}

export async function createChangeRequest(
  projectId: string,
  rawPayload: unknown,
  meta: CreateChangeRequestMeta,
  actorUserId: string | null = null,
) {
  const payload = changeRequestPayloadSchema.parse(rawPayload)
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({ where: { id: projectId }, select: { companyId: true } })
    if (!project) throw new Error('Job not found.')
    await assertChangeAllowed(tx, projectId, payload)
    const request = await tx.changeRequest.create({
      data: {
        projectId,
        type: TYPE_BY_KIND[payload.kind],
        requestedByType: meta.requestedByType,
        requestedByUserId: meta.requestedByUserId ?? null,
        description: describe(payload),
        reason: meta.reason ?? null,
        payload: payload as unknown as Prisma.InputJsonValue,
        payloadVersion: 1,
      },
    })
    await tx.auditLog.create({
      data: {
        companyId: project.companyId,
        action: 'change_request.created',
        entityType: 'ChangeRequest',
        entityId: request.id,
        actorUserId,
        afterData: { kind: payload.kind },
      },
    })
    return request
  })
}

export async function editChangeRequestPayload(changeRequestId: string, rawPayload: unknown, actorUserId: string | null = null) {
  const payload = changeRequestPayloadSchema.parse(rawPayload)
  return prisma.$transaction(async (tx) => {
    const cr = await tx.changeRequest.findUnique({ where: { id: changeRequestId }, include: { project: { select: { companyId: true } } } })
    if (!cr) throw new Error('Change request not found.')
    if (cr.status === 'APPLIED') throw new Error('An applied change request cannot be edited.')
    await assertChangeAllowed(tx, cr.projectId, payload)
    const updated = await tx.changeRequest.update({
      where: { id: changeRequestId },
      data: {
        payload: payload as unknown as Prisma.InputJsonValue,
        payloadVersion: cr.payloadVersion + 1,
        type: TYPE_BY_KIND[payload.kind],
        description: describe(payload),
        status: 'PENDING',
        approvedByUserId: null,
        approvedAt: null,
        assessedBookingVersion: null,
        assessedQuoteVersionId: null,
        clientAgreedVia: null,
        clientAgreedAt: null,
        clientAgreedByUserId: null,
        agreedQuoteVersionId: null,
      },
    })
    await tx.auditLog.create({
      data: {
        companyId: cr.project.companyId,
        action: 'change_request.payload_edited',
        entityType: 'ChangeRequest',
        entityId: changeRequestId,
        actorUserId,
        afterData: { payloadVersion: updated.payloadVersion },
      },
    })
    return updated
  })
}

export async function assessChangeRequest(changeRequestId: string, actorUserId: string | null = null) {
  return prisma.$transaction(async (tx) => {
    const cr = await tx.changeRequest.findUnique({ where: { id: changeRequestId }, include: { project: { select: { companyId: true } } } })
    if (!cr) throw new Error('Change request not found.')
    if (cr.status === 'APPLIED' || cr.status === 'REJECTED') throw new Error('This change request is closed.')
    const payload = changeRequestPayloadSchema.parse(cr.payload)
    await assertChangeAllowed(tx, cr.projectId, payload)

    let assessedBookingVersion: string | null = null
    let assessedQuoteVersionId: string | null = null
    if (payload.kind === 'reschedule') {
      const booking = await tx.booking.findUnique({ where: { id: payload.bookingId }, select: { updatedAt: true } })
      assessedBookingVersion = booking ? booking.updatedAt.toISOString() : null
    }
    if (payload.kind === 'scopeChange') {
      const accepted = await tx.quoteVersion.findFirst({ where: { quote: { projectId: cr.projectId }, status: 'ACCEPTED' }, select: { id: true } })
      assessedQuoteVersionId = accepted?.id ?? null
    }

    const updated = await tx.changeRequest.update({
      where: { id: changeRequestId },
      data: {
        status: 'IMPACT_ASSESSMENT',
        commercialImpact: commercialAmount(payload),
        scheduleImpact: payload.kind === 'reschedule',
        assessedBookingVersion,
        assessedQuoteVersionId,
      },
    })
    await tx.auditLog.create({
      data: { companyId: cr.project.companyId, action: 'change_request.assessed', entityType: 'ChangeRequest', entityId: changeRequestId, actorUserId },
    })
    return updated
  })
}

export async function approveChangeRequest(changeRequestId: string, actorUserId: string | null = null) {
  const now = systemClock.now()
  return prisma.$transaction(async (tx) => {
    const cr = await tx.changeRequest.findUnique({ where: { id: changeRequestId }, include: { project: { select: { companyId: true } } } })
    if (!cr) throw new Error('Change request not found.')
    if (cr.status !== 'IMPACT_ASSESSMENT') throw new Error('Assess the change request before approving it.')
    const payload = changeRequestPayloadSchema.parse(cr.payload)

    if (commercialAmount(payload).greaterThanOrEqualTo(APPROVAL_THRESHOLD) && actorUserId) {
      const actor = await tx.user.findUnique({ where: { id: actorUserId }, select: { role: true } })
      if (actor && actor.role !== 'ADMIN') {
        throw new Error('A change of this value needs a manager to approve it.')
      }
    }

    const updated = await tx.changeRequest.update({
      where: { id: changeRequestId },
      data: { status: 'APPROVED', approvedByUserId: actorUserId, approvedAt: now },
    })
    await tx.auditLog.create({
      data: { companyId: cr.project.companyId, action: 'change_request.approved', entityType: 'ChangeRequest', entityId: changeRequestId, actorUserId },
    })
    return updated
  })
}

export async function recordClientAgreement(
  changeRequestId: string,
  agreement: { via: string; agreedByUserId?: string | null; agreedQuoteVersionId?: string | null },
  actorUserId: string | null = null,
) {
  const now = systemClock.now()
  return prisma.$transaction(async (tx) => {
    const cr = await tx.changeRequest.findUnique({ where: { id: changeRequestId }, include: { project: { select: { companyId: true } } } })
    if (!cr) throw new Error('Change request not found.')
    if (cr.status === 'APPLIED' || cr.status === 'REJECTED') throw new Error('This change request is closed.')
    const updated = await tx.changeRequest.update({
      where: { id: changeRequestId },
      data: {
        clientAgreedVia: agreement.via,
        clientAgreedAt: now,
        clientAgreedByUserId: agreement.agreedByUserId ?? null,
        agreedQuoteVersionId: agreement.agreedQuoteVersionId ?? null,
      },
    })
    await tx.auditLog.create({
      data: { companyId: cr.project.companyId, action: 'change_request.client_agreed', entityType: 'ChangeRequest', entityId: changeRequestId, actorUserId, afterData: { via: agreement.via } },
    })
    return updated
  })
}

export async function rejectChangeRequest(changeRequestId: string, reason: string | null = null, actorUserId: string | null = null) {
  const now = systemClock.now()
  return prisma.$transaction(async (tx) => {
    const cr = await tx.changeRequest.findUnique({ where: { id: changeRequestId }, include: { project: { select: { companyId: true } } } })
    if (!cr) throw new Error('Change request not found.')
    if (cr.status === 'APPLIED') throw new Error('An applied change request cannot be rejected.')
    const updated = await tx.changeRequest.update({
      where: { id: changeRequestId },
      data: { status: 'REJECTED', rejectedAt: now, reason: reason ?? cr.reason },
    })
    await tx.auditLog.create({
      data: { companyId: cr.project.companyId, action: 'change_request.rejected', entityType: 'ChangeRequest', entityId: changeRequestId, actorUserId, afterData: { reason } },
    })
    return updated
  })
}

export async function applyChangeRequest(changeRequestId: string, actorUserId: string | null = null) {
  const now = systemClock.now()
  return prisma.$transaction(async (tx) => {
    const cr = await tx.changeRequest.findUnique({ where: { id: changeRequestId }, include: { project: { select: { id: true, companyId: true } } } })
    if (!cr) throw new Error('Change request not found.')
    if (cr.status !== 'APPROVED') throw new Error('Approve the change request before applying it.')
    const payload = changeRequestPayloadSchema.parse(cr.payload)

    if (requiresClientAgreement(payload) && !cr.clientAgreedAt) {
      throw new Error('This change needs the client’s agreement before it can be applied.')
    }

    if (payload.kind === 'reschedule') {
      const booking = await tx.booking.findUnique({ where: { id: payload.bookingId }, select: { updatedAt: true, status: true } })
      if (!booking || booking.status === 'CANCELLED') throw new Error('That shoot changed since assessment; re-assess the change request.')
      if (cr.assessedBookingVersion && booking.updatedAt.toISOString() !== cr.assessedBookingVersion) {
        throw new Error('That shoot changed since assessment; re-assess the change request.')
      }
    }
    if (payload.kind === 'scopeChange') {
      const accepted = await tx.quoteVersion.findFirst({ where: { quote: { projectId: cr.projectId }, status: 'ACCEPTED' }, select: { id: true } })
      if ((accepted?.id ?? null) !== (cr.assessedQuoteVersionId ?? null)) {
        throw new Error('The quote changed since assessment; re-assess the change request.')
      }
    }

    const claim = await tx.changeRequest.updateMany({ where: { id: changeRequestId, status: 'APPROVED' }, data: { status: 'APPLIED', appliedAt: now } })
    if (claim.count === 0) throw new Error('This change request was already applied.')

    let resultingQuoteVersionId: string | null = cr.agreedQuoteVersionId ?? null

    if (payload.kind === 'reschedule') {
      const startsAt = parseSydney(payload.newStartsAt)
      const endsAt = parseSydney(payload.newEndsAt)
      if (startsAt.getTime() < now.getTime()) throw new Error('The new shoot date is in the past.')
      if (endsAt <= startsAt) throw new Error('The end time must be after the start time.')
      await rescheduleBookingTx(tx, payload.bookingId, { startsAt, endsAt, reason: cr.reason }, actorUserId)
      if (payload.fee) await issueAdjustmentInvoiceTx(tx, cr.projectId, payload.fee.amount, `Rescheduling fee`, actorUserId, now)
    } else if (payload.kind === 'scopeChange') {
      resultingQuoteVersionId = await applyScopeChangeTx(tx, cr.projectId, payload, actorUserId, now)
    } else if (payload.kind === 'priceDecrease') {
      await issueCreditNoteTx(tx, payload.invoiceId, payload.amount, payload.reason ?? null, actorUserId)
    } else if (payload.kind === 'production') {
      await createRevisionTaskTx(tx, cr.project.companyId, cr.projectId, payload, actorUserId)
    }

    const updated = await tx.changeRequest.update({ where: { id: changeRequestId }, data: { resultingQuoteVersionId } })
    await tx.auditLog.create({
      data: { companyId: cr.project.companyId, action: 'change_request.applied', entityType: 'ChangeRequest', entityId: changeRequestId, actorUserId, afterData: { kind: payload.kind, resultingQuoteVersionId } },
    })
    await tx.outboxEvent.create({
      data: { eventType: 'change_request.applied', aggregateType: 'ChangeRequest', aggregateId: changeRequestId, payload: { changeRequestId, projectId: cr.projectId, kind: payload.kind } },
    })
    return updated
  })
}

async function issueAdjustmentInvoiceTx(tx: Tx, projectId: string, amount: string, description: string, actorUserId: string | null, now: Date) {
  const invoice = await createInvoiceTx(tx, projectId, { type: 'SUPPLEMENTARY', description, amount }, actorUserId)
  await tx.invoice.update({ where: { id: invoice.id }, data: { status: 'ISSUED', issuedAt: now } })
  await tx.outboxEvent.create({ data: { eventType: 'invoice.issued', aggregateType: 'Invoice', aggregateId: invoice.id, payload: { invoiceId: invoice.id } } })
  return invoice
}

async function applyScopeChangeTx(
  tx: Tx,
  projectId: string,
  payload: Extract<ChangeRequestPayload, { kind: 'scopeChange' }>,
  actorUserId: string | null,
  now: Date,
): Promise<string> {
  const quote = await tx.quote.findFirst({ where: { projectId }, orderBy: { createdAt: 'desc' }, select: { id: true } })
  if (!quote) throw new Error('This job has no quote to revise.')
  const rev = await reviseQuoteTx(tx, quote.id, actorUserId, { allowFromAccepted: true })
  const feeAmount = new Prisma.Decimal(payload.fee.amount)
  const { subtotal: feeSub, taxTotal: feeTax } = splitGstInclusive(feeAmount)
  const ver = await tx.quoteVersion.findUniqueOrThrow({ where: { id: rev.versionId }, select: { subtotal: true, taxTotal: true, total: true } })
  const lastLine = await tx.quoteLine.findFirst({ where: { quoteVersionId: rev.versionId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } })
  await tx.quoteLine.create({
    data: {
      quoteVersionId: rev.versionId,
      lineType: 'custom',
      description: payload.summary,
      quantity: 1,
      unitPrice: feeAmount,
      tax: feeTax,
      lineTotal: feeAmount,
      sortOrder: (lastLine?.sortOrder ?? 0) + 1,
    },
  })
  await tx.quoteVersion.update({
    where: { id: rev.versionId },
    data: {
      subtotal: ver.subtotal.add(feeSub),
      taxTotal: ver.taxTotal.add(feeTax),
      total: ver.total.add(feeAmount),
      status: 'ACCEPTED',
      acceptedByClientAt: now,
    },
  })
  await issueAdjustmentInvoiceTx(tx, projectId, payload.fee.amount, `Scope change: ${payload.summary}`, actorUserId, now)
  return rev.versionId
}

async function createRevisionTaskTx(
  tx: Tx,
  companyId: string,
  projectId: string,
  payload: Extract<ChangeRequestPayload, { kind: 'production' }>,
  actorUserId: string | null,
) {
  const last = await tx.workItem.findFirst({ where: { projectId, stage: 'editing' }, orderBy: { order: 'desc' }, select: { order: true } })
  await tx.workItem.create({
    data: {
      companyId,
      projectId,
      kind: 'CUSTOM',
      stage: 'editing',
      type: 'TODO',
      title: `Revision: ${payload.summary}`,
      status: 'PENDING',
      order: (last?.order ?? 0) + 1,
      dueOverrideAt: payload.dueAt ? parseSydney(payload.dueAt) : null,
      // v1: WorkItem has no assignee column, so the owner is recorded in the audit trail below, not here.
    },
  })
  await tx.auditLog.create({
    data: { companyId, action: 'project.revision_task_added', entityType: 'Project', entityId: projectId, actorUserId, afterData: { summary: payload.summary, ownerUserId: payload.ownerUserId ?? null } },
  })
}
