import { createHash, randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'
import { systemClock } from '@/lib/time'

/**
 * A contract is generated from the project's ACCEPTED quote. The commercial terms are snapshotted so
 * the signed document can never drift if the quote is later amended (blueprint §5, invariant 2). The
 * client signs by token; on signature the project is CONFIRMED. A signed version is immutable, guarded
 * both here and by a database trigger.
 */

/** Standard booking terms. Wording is a working draft until confirmed (OQ-017); kept generic, no invented policy. */
const DEFAULT_BOOKING_TERMS: readonly string[] = [
  'This agreement confirms the booking for the project referenced above.',
  'The quoted total is inclusive of GST.',
  'A deposit may be required to secure the date; the balance is due before final delivery.',
  'Either party may request changes in writing; changes may affect the price or timeline.',
]

export type ContractLineSnapshot = { description: string; quantity: number; lineTotal: string }

export type ContractTermsSnapshot = {
  projectCode: string
  clientName: string
  currency: string
  lines: ContractLineSnapshot[]
  subtotal: string
  taxTotal: string
  total: string
  terms: readonly string[]
}

/**
 * Assemble the immutable terms snapshot from the accepted quote. Money arrives already stringified
 * (Prisma.Decimal.toString) so this stays a pure, JSON-serialisable function (no floats, BR-P03).
 */
export function buildContractTerms(input: {
  projectCode: string
  clientName: string
  currency: string
  lines: ContractLineSnapshot[]
  subtotal: string
  taxTotal: string
  total: string
  terms?: readonly string[]
}): ContractTermsSnapshot {
  return {
    projectCode: input.projectCode,
    clientName: input.clientName,
    currency: input.currency,
    lines: input.lines,
    subtotal: input.subtotal,
    taxTotal: input.taxTotal,
    total: input.total,
    terms: input.terms ?? DEFAULT_BOOKING_TERMS,
  }
}

/** Deterministic hash of the snapshot; proves the signed content never changed. */
export function contractContentHash(snapshot: ContractTermsSnapshot): string {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')
}

/**
 * Create a draft contract (version 1) from the project's accepted quote. One contract per project for
 * now; amendments become new versions in a later slice. Writes an audit row and an outbox event.
 */
export async function createContractFromAcceptedQuote(projectId: string, createdById: string | null) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.contract.findFirst({ where: { projectId } })
    if (existing) throw new Error('A contract already exists for this project.')

    const acceptedVersion = await tx.quoteVersion.findFirst({
      where: { status: 'ACCEPTED', quote: { projectId } },
      include: {
        lines: { orderBy: { sortOrder: 'asc' } },
        quote: { include: { project: { include: { client: { select: { displayName: true } } } } } },
      },
    })
    if (!acceptedVersion) throw new Error('Accept a quote before creating the contract.')

    const project = acceptedVersion.quote.project
    const snapshot = buildContractTerms({
      projectCode: project.code,
      clientName: project.client.displayName,
      currency: acceptedVersion.currency,
      lines: acceptedVersion.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        lineTotal: line.lineTotal.toString(),
      })),
      subtotal: acceptedVersion.subtotal.toString(),
      taxTotal: acceptedVersion.taxTotal.toString(),
      total: acceptedVersion.total.toString(),
    })

    const contract = await tx.contract.create({
      data: {
        projectId,
        signToken: randomBytes(24).toString('base64url'),
        status: 'DRAFT',
        versions: {
          create: {
            versionNumber: 1,
            status: 'DRAFT',
            termsSnapshot: snapshot,
            contentHash: contractContentHash(snapshot),
            createdById,
          },
        },
      },
      include: { versions: true },
    })
    const version = contract.versions[0]
    if (!version) throw new Error('Contract version was not created.')
    await tx.contract.update({
      where: { id: contract.id },
      data: { currentVersionId: version.id },
    })

    await tx.auditLog.create({
      data: {
        action: 'contract.created',
        entityType: 'Contract',
        entityId: contract.id,
        actorUserId: createdById,
        afterData: { projectId, total: snapshot.total },
      },
    })
    await tx.outboxEvent.create({
      data: {
        eventType: 'contract.created',
        aggregateType: 'Contract',
        aggregateId: contract.id,
        payload: { contractId: contract.id, projectId },
      },
    })

    return { contractId: contract.id, versionId: version.id, signToken: contract.signToken }
  })
}

/** Send the draft contract to the client: lock the current version to SENT. */
export async function sendContract(contractId: string, actorUserId: string | null) {
  return prisma.$transaction(async (tx) => {
    const contract = await tx.contract.findUnique({
      where: { id: contractId },
      include: { currentVersion: true },
    })
    if (!contract || !contract.currentVersion) throw new Error('Contract not found.')
    const version = contract.currentVersion
    if (version.status !== 'DRAFT') throw new Error('This contract has already been sent.')

    await tx.contractVersion.update({ where: { id: version.id }, data: { status: 'SENT' } })
    await tx.contract.update({ where: { id: contractId }, data: { status: 'SENT' } })
    await tx.auditLog.create({
      data: {
        action: 'contract.sent',
        entityType: 'Contract',
        entityId: contractId,
        actorUserId,
      },
    })
    await tx.outboxEvent.create({
      data: {
        eventType: 'contract.sent',
        aggregateType: 'Contract',
        aggregateId: contractId,
        payload: { contractId, signToken: contract.signToken },
      },
    })
    return { signToken: contract.signToken }
  })
}

/**
 * Client signs the current version by token. Idempotent if already signed. On signature the version
 * is locked SIGNED (immutable) and the project moves to CONFIRMED.
 */
export async function signContractByToken(signToken: string, signedName: string, ip: string) {
  const now = systemClock.now()
  return prisma.$transaction(async (tx) => {
    const contract = await tx.contract.findUnique({
      where: { signToken },
      include: { currentVersion: true },
    })
    if (!contract || !contract.currentVersion) throw new Error('Contract not found.')
    const version = contract.currentVersion
    if (version.status === 'SIGNED') return { alreadySigned: true }
    if (version.status !== 'SENT') throw new Error('This contract cannot be signed.')

    await tx.contractVersion.update({
      where: { id: version.id },
      data: { status: 'SIGNED', signedAt: now, signedName, signedIp: ip },
    })
    await tx.contract.update({ where: { id: contract.id }, data: { status: 'SIGNED' } })
    await tx.project.update({
      where: { id: contract.projectId },
      data: { lifecycleStatus: 'CONFIRMED' },
    })
    await tx.auditLog.create({
      data: {
        action: 'contract.signed',
        entityType: 'Contract',
        entityId: contract.id,
        source: 'client.contract',
        afterData: { signedName },
      },
    })
    await tx.outboxEvent.create({
      data: {
        eventType: 'contract.signed',
        aggregateType: 'Contract',
        aggregateId: contract.id,
        payload: { contractId: contract.id, projectId: contract.projectId },
      },
    })
    return { alreadySigned: false }
  })
}
