import { createHash, randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'
import { systemClock } from '@/lib/time'

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

export function contractContentHash(snapshot: ContractTermsSnapshot): string {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')
}

export async function createContractFromAcceptedQuote(projectId: string, createdByUserId: string | null) {
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
    if (!project) throw new Error('This quote is not linked to a job yet.')
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
            createdByUserId,
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
        actorUserId: createdByUserId,
        afterData: { projectId, total: snapshot.total },
      },
    })

    return { contractId: contract.id, versionId: version.id, signToken: contract.signToken }
  })
}

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
    return { signToken: contract.signToken }
  })
}

const STOPPED = new Set(['CANCELLED', 'CLOSED'])

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

    const project = await tx.project.findUnique({ where: { id: contract.projectId }, select: { lifecycleStatus: true } })
    if (!project || STOPPED.has(project.lifecycleStatus)) throw new Error('This booking is no longer active, so the contract cannot be signed. Please contact the studio.')

    await tx.contractVersion.update({
      where: { id: version.id },
      data: {
        status: 'SIGNED',
        signedByClientAt: now,
        signedByClientName: signedName,
        signedByClientIp: ip,
      },
    })
    await tx.contract.update({ where: { id: contract.id }, data: { status: 'SIGNED' } })

    await tx.auditLog.create({
      data: {
        action: 'contract.signed',
        entityType: 'Contract',
        entityId: contract.id,
        source: 'client.contract',
        afterData: { signedName },
      },
    })
    return { alreadySigned: false }
  })
}
