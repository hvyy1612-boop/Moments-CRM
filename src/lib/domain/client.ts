import { prisma } from '@/lib/db'
import { systemClock } from '@/lib/time'
import type { ClientInput } from '@/lib/validation/client'
import { requireCompany } from './project'
import { INVOICE_MONEY_SELECT } from './invoice-money'

/** Build the display name a client is listed under, from whatever was entered. */
function deriveDisplayName(input: ClientInput): string {
  const person = [input.firstName, input.lastName].filter(Boolean).join(' ').trim()
  if (input.isCompany && input.company) return input.company
  if (person) return person
  if (input.company) return input.company
  return input.email
}

/** Create a client by hand (staff, not from an enquiry). Email is unique - a duplicate is rejected. */
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

/** Find an existing client by email, or create one. Used when a lead/enquiry needs a linked client
 *  (Studio-Ninja "Primary Client Contact"): a person is one Client, reused across enquiries/jobs. */
export async function findOrCreateClient(input: ClientInput, actorUserId: string) {
  const existing = await prisma.client.findUnique({ where: { email: input.email } })
  if (existing) return existing
  return createClient(input, actorUserId)
}

/** Edit a client's contact details. */
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

/** Archive a client (kept, hidden from the active list). Used when a hard delete is not safe. */
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

/** Bring an archived client back to the active list. */
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

/**
 * Delete a client for good. Only when nothing references them (no projects) - a client with real work
 * must be archived instead, so business records are never orphaned. The caller decides which to offer.
 */
/**
 * Permanently delete a client AND everything under them - jobs, bookings, quotes, contracts,
 * invoices, payments, galleries, tasks, communications and contacts (Studio-Ninja style hard delete).
 * Runs in one transaction; the FK-restricted children are removed before their project, so a failure
 * rolls back and the client is left untouched. This is irreversible - the UI confirms first and it is
 * ADMIN-only.
 */
export async function deleteClient(clientId: string, actorUserId: string) {
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, companyId: true } })
  if (!client) throw new Error('Client not found.')
  const projects = await prisma.project.findMany({ where: { clientId }, select: { id: true } })
  const projectIds = projects.map((p) => p.id)

  return prisma.$transaction(async (tx) => {
    if (projectIds.length > 0) {
      const inP = { projectId: { in: projectIds } }
      // Restrict children first (must go before the project itself)...
      await tx.payment.deleteMany({ where: inP })
      await tx.invoice.deleteMany({ where: inP })
      await tx.quote.deleteMany({ where: inP })
      await tx.contract.deleteMany({ where: inP })
      await tx.booking.deleteMany({ where: inP })
      await tx.gallery.deleteMany({ where: inP })
      // ...then the projects (cascades work items, communications, files, questionnaires, change requests).
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

/** Update the free-text note on a client (staff-controlled, inline on the client page). */
export async function updateClientNotes(clientId: string, notes: string, actorUserId: string) {
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, companyId: true } })
  if (!client) throw new Error('Client not found.')
  await prisma.client.update({ where: { id: clientId }, data: { notes: notes.trim() || null } })
  await prisma.auditLog.create({
    data: { companyId: client.companyId, actorUserId, action: 'client.notes_updated', entityType: 'Client', entityId: clientId },
  })
}

/**
 * Merge a duplicate client into a survivor (F-ENQ-05). Staff-confirmed only - the app never auto-
 * merges. All of the duplicate's projects (and any enquiries that converted to it) move to the
 * survivor; the duplicate is archived and points at the survivor via merged_into_client_id so a
 * later enquiry with its old email resolves to the survivor instead of reviving the duplicate.
 */
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

/** Add a titled note to a client's running notes list. */
export async function addClientNote(clientId: string, title: string, body: string, actorUserId: string) {
  if (!body.trim()) throw new Error('Write a note.')
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } })
  if (!client) throw new Error('Client not found.')
  await prisma.clientNote.create({
    data: { clientId, title: title.trim().slice(0, 150) || null, body: body.trim().slice(0, 5000), createdByUserId: actorUserId },
  })
}

/** Delete one client note. */
export async function deleteClientNote(noteId: string) {
  await prisma.clientNote.delete({ where: { id: noteId } })
}

/** Record or withdraw the client's marketing consent (timestamped). */
export async function setClientConsent(clientId: string, consent: boolean) {
  await prisma.client.update({ where: { id: clientId }, data: { marketingConsent: consent, consentUpdatedAt: new Date() } })
}

function portalTokenValue(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Ensure the client has a unified-portal token, creating one on first use. */
export async function ensureClientPortalToken(clientId: string): Promise<string> {
  const c = await prisma.client.findUnique({ where: { id: clientId }, select: { portalToken: true } })
  if (c?.portalToken) return c.portalToken
  const token = portalTokenValue()
  await prisma.client.update({ where: { id: clientId }, data: { portalToken: token } })
  return token
}

/** Everything a client can see in their portal (by token, no login): jobs, invoices, galleries, questionnaires. */
export async function getClientPortalByToken(token: string) {
  if (!token || token.length < 16) return null
  return prisma.client.findUnique({
    where: { portalToken: token },
    select: {
      displayName: true,
      company: { select: { name: true } },
      projects: {
        orderBy: { enquiryReceivedAt: 'desc' },
        select: {
          id: true, name: true, code: true, lifecycleStatus: true,
          bookings: { where: { status: { not: 'CANCELLED' } }, orderBy: { startsAt: 'asc' }, take: 1, select: { startsAt: true } },
          invoices: { orderBy: { createdAt: 'desc' }, select: { accessToken: true, invoiceNumber: true, ...INVOICE_MONEY_SELECT } },
          galleries: { where: { status: 'PUBLISHED' }, orderBy: { createdAt: 'desc' }, select: { accessToken: true, title: true } },
          questionnaires: { orderBy: { createdAt: 'desc' }, select: { accessToken: true, title: true, status: true } },
        },
      },
    },
  })
}
