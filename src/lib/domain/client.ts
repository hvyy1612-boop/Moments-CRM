import { prisma } from '@/lib/db'
import { systemClock } from '@/lib/time'
import type { ClientInput } from '@/lib/validation/client'
import { requireCompany } from './project'

function deriveDisplayName(input: ClientInput): string {
  const person = [input.firstName, input.lastName].filter(Boolean).join(' ').trim()
  if (input.isCompany && input.company) return input.company
  if (person) return person
  if (input.company) return input.company
  return input.email
}

export async function createClient(input: ClientInput, actorUserId: string) {
  return prisma.$transaction(async (tx) => {
    const company = await requireCompany(tx)
    const existing = await tx.client.findUnique({ where: { email: input.email } })
    if (existing) throw new Error('A client with this email already exists.')
    const client = await tx.client.create({
      data: {
        companyId: company.id,
        type: input.isCompany ? 'BUSINESS' : 'INDIVIDUAL',
        status: 'ACTIVE',
        source: 'MANUAL',
        displayName: deriveDisplayName(input),
        legalName: input.company ?? null,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        email: input.email,
        phone: input.phone ?? null,
        street: input.street ?? null,
        suburb: input.suburb ?? null,
        state: input.state ?? null,
        postcode: input.postcode ?? null,
        country: input.country ?? null,
        notes: input.notes ?? null,
      },
    })
    await tx.auditLog.create({
      data: {
        companyId: company.id,
        actorUserId,
        action: 'client.created',
        entityType: 'Client',
        entityId: client.id,
        afterData: { email: client.email, name: client.displayName },
      },
    })
    return client
  })
}

export async function updateClient(clientId: string, input: ClientInput, actorUserId: string) {
  return prisma.$transaction(async (tx) => {
    const client = await tx.client.findUnique({ where: { id: clientId } })
    if (!client) throw new Error('Client not found.')
    if (input.email !== client.email) {
      const clash = await tx.client.findUnique({ where: { email: input.email } })
      if (clash) throw new Error('Another client already uses this email.')
    }
    const updated = await tx.client.update({
      where: { id: clientId },
      data: {
        type: input.isCompany ? 'BUSINESS' : 'INDIVIDUAL',
        displayName: deriveDisplayName(input),
        legalName: input.company ?? null,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        email: input.email,
        phone: input.phone ?? null,
        street: input.street ?? null,
        suburb: input.suburb ?? null,
        state: input.state ?? null,
        postcode: input.postcode ?? null,
        country: input.country ?? null,
        notes: input.notes ?? null,
      },
    })
    await tx.auditLog.create({
      data: {
        companyId: client.companyId,
        actorUserId,
        action: 'client.updated',
        entityType: 'Client',
        entityId: clientId,
      },
    })
    return updated
  })
}

export async function archiveClient(clientId: string, actorUserId: string) {
  return prisma.$transaction(async (tx) => {
    const client = await tx.client.findUnique({ where: { id: clientId } })
    if (!client) throw new Error('Client not found.')
    await tx.client.update({
      where: { id: clientId },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    })
    await tx.auditLog.create({
      data: { companyId: client.companyId, actorUserId, action: 'client.archived', entityType: 'Client', entityId: clientId },
    })
  })
}

export async function restoreClient(clientId: string, actorUserId: string) {
  return prisma.$transaction(async (tx) => {
    const client = await tx.client.findUnique({ where: { id: clientId } })
    if (!client) throw new Error('Client not found.')
    await tx.client.update({
      where: { id: clientId },
      data: { status: 'ACTIVE', archivedAt: null },
    })
    await tx.auditLog.create({
      data: { companyId: client.companyId, actorUserId, action: 'client.restored', entityType: 'Client', entityId: clientId },
    })
  })
}

export async function deleteClient(clientId: string, actorUserId: string) {
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, companyId: true } })
  if (!client) throw new Error('Client not found.')
  const projects = await prisma.project.findMany({ where: { clientId }, select: { id: true } })
  const projectIds = projects.map((p) => p.id)

  return prisma.$transaction(async (tx) => {
    if (projectIds.length > 0) {
      const inP = { projectId: { in: projectIds } }

      await tx.payment.deleteMany({ where: inP })
      await tx.invoice.deleteMany({ where: inP })
      await tx.quote.deleteMany({ where: inP })
      await tx.contract.deleteMany({ where: inP })
      await tx.booking.deleteMany({ where: inP })
      await tx.gallery.deleteMany({ where: inP })

      await tx.project.deleteMany({ where: { id: { in: projectIds } } })
    }
    await tx.communication.deleteMany({ where: { clientId } })
    await tx.contact.deleteMany({ where: { clientId } })
    await tx.client.delete({ where: { id: clientId } })
    await tx.auditLog.create({
      data: { companyId: client.companyId, actorUserId, action: 'client.deleted', entityType: 'Client', entityId: clientId },
    })
  })
}

export async function updateClientNotes(clientId: string, notes: string, actorUserId: string) {
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, companyId: true } })
  if (!client) throw new Error('Client not found.')
  await prisma.client.update({ where: { id: clientId }, data: { notes: notes.trim() || null } })
  await prisma.auditLog.create({
    data: { companyId: client.companyId, actorUserId, action: 'client.notes_updated', entityType: 'Client', entityId: clientId },
  })
}

export async function mergeClients(
  survivorId: string,
  duplicateId: string,
  actorUserId: string | null = null,
) {
  if (survivorId === duplicateId) throw new Error('Cannot merge a client into itself.')
  const now = systemClock.now()
  return prisma.$transaction(async (tx) => {
    const [survivor, duplicate] = await Promise.all([
      tx.client.findUnique({ where: { id: survivorId } }),
      tx.client.findUnique({ where: { id: duplicateId } }),
    ])
    if (!survivor) throw new Error('Survivor client not found.')
    if (!duplicate) throw new Error('Duplicate client not found.')
    if (duplicate.mergedIntoClientId) throw new Error('This client has already been merged.')
    if (survivor.companyId !== duplicate.companyId) {
      throw new Error('Cannot merge clients from different companies.')
    }

    const moved = await tx.project.updateMany({
      where: { clientId: duplicateId },
      data: { clientId: survivorId },
    })
    await tx.enquiry.updateMany({
      where: { convertedClientId: duplicateId },
      data: { convertedClientId: survivorId },
    })
    await tx.client.update({
      where: { id: duplicateId },
      data: { mergedIntoClientId: survivorId, status: 'ARCHIVED', archivedAt: now },
    })

    await tx.auditLog.create({
      data: {
        companyId: survivor.companyId,
        action: 'client.merged',
        entityType: 'Client',
        entityId: duplicateId,
        actorUserId,
        afterData: { survivorId, movedProjects: moved.count },
      },
    })
    return { survivorId, duplicateId, movedProjects: moved.count }
  })
}

export async function addClientNote(clientId: string, title: string, body: string, actorUserId: string) {
  if (!body.trim()) throw new Error('Write a note.')
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } })
  if (!client) throw new Error('Client not found.')
  await prisma.clientNote.create({
    data: { clientId, title: title.trim().slice(0, 150) || null, body: body.trim().slice(0, 5000), createdByUserId: actorUserId },
  })
}

export async function deleteClientNote(noteId: string) {
  await prisma.clientNote.delete({ where: { id: noteId } })
}

export async function setClientConsent(clientId: string, consent: boolean) {
  await prisma.client.update({ where: { id: clientId }, data: { marketingConsent: consent, consentUpdatedAt: new Date() } })
}
