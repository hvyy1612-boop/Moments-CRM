import { Prisma, type ChangeRequestType } from '@prisma/client'
import { prisma } from '@/lib/db'
import { systemClock } from '@/lib/time'
import { reviseQuote } from './quote'

/**
 * Post-confirmation change requests (F-CHANGE-01). A change is never applied by editing a record in
 * place: PENDING -> IMPACT_ASSESSMENT -> APPROVED/REJECTED -> APPLIED. Applying a COMMERCIAL change
 * spawns a new quote version (via reviseQuote) and links it back; other types are recorded as applied
 * and carried out through their own flow (new booking, audited client edit, production revision).
 */

export type ChangeRequestInput = {
  type: ChangeRequestType
  description: string
  requestedByType: 'staff' | 'client'
  reason?: string | null
  requestedByUserId?: string | null
}

export async function createChangeRequest(
  projectId: string,
  input: ChangeRequestInput,
  actorUserId: string | null = null,
) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({ where: { id: projectId } })
    if (!project) throw new Error('Project not found.')
    const request = await tx.changeRequest.create({
      data: {
        projectId,
        type: input.type,
        requestedByType: input.requestedByType,
        requestedByUserId: input.requestedByUserId ?? null,
        description: input.description,
        reason: input.reason ?? null,
      },
    })
    await tx.auditLog.create({
      data: {
        companyId: project.companyId,
        action: 'change_request.created',
        entityType: 'ChangeRequest',
        entityId: request.id,
        actorUserId,
        afterData: { type: request.type },
      },
    })
    return request
  })
}

export async function assessChangeRequest(
  changeRequestId: string,
  impact: { commercialImpact?: Prisma.Decimal | string | number; scheduleImpact?: boolean },
  actorUserId: string | null = null,
) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.changeRequest.findUnique({
      where: { id: changeRequestId },
      include: { project: { select: { companyId: true } } },
    })
    if (!request) throw new Error('Change request not found.')
    const updated = await tx.changeRequest.update({
      where: { id: changeRequestId },
      data: {
        status: 'IMPACT_ASSESSMENT',
        commercialImpact:
          impact.commercialImpact === undefined
            ? undefined
            : new Prisma.Decimal(impact.commercialImpact),
        scheduleImpact: impact.scheduleImpact ?? undefined,
      },
    })
    await tx.auditLog.create({
      data: {
        companyId: request.project.companyId,
        action: 'change_request.assessed',
        entityType: 'ChangeRequest',
        entityId: changeRequestId,
        actorUserId,
      },
    })
    return updated
  })
}

export async function approveChangeRequest(changeRequestId: string, actorUserId: string | null = null) {
  const now = systemClock.now()
  return prisma.$transaction(async (tx) => {
    const request = await tx.changeRequest.findUnique({
      where: { id: changeRequestId },
      include: { project: { select: { companyId: true } } },
    })
    if (!request) throw new Error('Change request not found.')
    if (request.status === 'REJECTED' || request.status === 'APPLIED') {
      throw new Error('This change request is already closed.')
    }
    const updated = await tx.changeRequest.update({
      where: { id: changeRequestId },
      data: { status: 'APPROVED', approvedByUserId: actorUserId, approvedAt: now },
    })
    await tx.auditLog.create({
      data: {
        companyId: request.project.companyId,
        action: 'change_request.approved',
        entityType: 'ChangeRequest',
        entityId: changeRequestId,
        actorUserId,
      },
    })
    return updated
  })
}

export async function rejectChangeRequest(changeRequestId: string, actorUserId: string | null = null) {
  const now = systemClock.now()
  return prisma.$transaction(async (tx) => {
    const request = await tx.changeRequest.findUnique({
      where: { id: changeRequestId },
      include: { project: { select: { companyId: true } } },
    })
    if (!request) throw new Error('Change request not found.')
    if (request.status === 'APPLIED') throw new Error('An applied change request cannot be rejected.')
    const updated = await tx.changeRequest.update({
      where: { id: changeRequestId },
      data: { status: 'REJECTED', rejectedAt: now },
    })
    await tx.auditLog.create({
      data: {
        companyId: request.project.companyId,
        action: 'change_request.rejected',
        entityType: 'ChangeRequest',
        entityId: changeRequestId,
        actorUserId,
      },
    })
    return updated
  })
}

/**
 * Apply an approved change. A commercial change creates a new quote revision and links it; other
 * types are marked applied (their downstream work happens through the normal booking/edit flows).
 */
export async function applyChangeRequest(changeRequestId: string, actorUserId: string | null = null) {
  const request = await prisma.changeRequest.findUnique({ where: { id: changeRequestId } })
  if (!request) throw new Error('Change request not found.')
  if (request.status !== 'APPROVED') throw new Error('Approve the change request before applying it.')

  let resultingQuoteVersionId: string | null = null
  if (request.type === 'COMMERCIAL') {
    const quote = await prisma.quote.findFirst({
      where: { projectId: request.projectId },
      orderBy: { createdAt: 'desc' },
    })
    if (quote) {
      const revision = await reviseQuote(quote.id, actorUserId)
      resultingQuoteVersionId = revision.versionId
    }
  }

  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: request.projectId },
      select: { companyId: true },
    })
    const updated = await tx.changeRequest.update({
      where: { id: changeRequestId },
      data: { status: 'APPLIED', resultingQuoteVersionId },
    })
    await tx.auditLog.create({
      data: {
        companyId: project?.companyId ?? null,
        action: 'change_request.applied',
        entityType: 'ChangeRequest',
        entityId: changeRequestId,
        actorUserId,
        afterData: { type: request.type, resultingQuoteVersionId },
      },
    })
    return updated
  })
}
