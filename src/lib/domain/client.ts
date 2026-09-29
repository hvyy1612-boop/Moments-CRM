import { prisma } from '@/lib/db'
import { systemClock } from '@/lib/time'
import type { ClientInput } from '@/lib/validation/client'
import { requireCompany } from './project'
import { INVOICE_MONEY_SELECT } from './invoice-money'
import { nextRecordNumber, isUniqueViolation } from './numbering'

/** Build the display name a client is listed under, from whatever was entered. */
function deriveDisplayName(input: ClientInput): string {
  const person = [input.firstName, input.lastName].filter(Boolean).join(' ').trim()
  if (input.isCompany && input.company) return input.company
  if (person) return person
  if (input.company) return input.company
  return input.email
}

/** Create a client by hand (staff, not from an enquiry). Email is unique - a duplicate is rejected.
 *  Assigns the next C<YYYY><4d> client number; a P2002 (number or email race) retries a few times so
 *  concurrency never surfaces as an error and no two clients ever share a number. */
export async function createClient(input: ClientInput, actorUserId: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await runCreateClient(input, actorUserId)
    } catch (error) {
      if (attempt < 4 && isUniqueViolation(error)) continue
      throw error
    }
  }
}

async function runCreateClient(input: ClientInput, actorUserId: string) {
  return prisma.$transaction(async (tx) => {
    const company = await requireCompany(tx)
    const existing = await tx.client.findUnique({ where: { email: input.email } })
    if (existing) throw new Error('A client with this email already exists.')
    const clientNumber = await nextRecordNumber(tx, company.id, 'CLIENT')
    const client = await tx.client.create({
      data: {
        companyId: company.id,
        clientNumber,
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
 * True when a client carries real history - any job, any enquiry (a current lead or one that already
 * converted), or another duplicate merged into them. Such a client is NEVER hard-deleted: the "Remove"
 * flow archives them instead (reversible), so business records and the payment ledger are never
 * orphaned or destroyed. Only a truly empty client (all counts zero) is safe to delete outright, via
 * {@link deleteEmptyClients}. This replaces the old cascade delete, which wiped a client's paid
 * invoices and payments and so broke the ledger-integrity invariant.
 */
export async function clientHasHistory(clientId: string): Promise<boolean> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      _count: {
        select: { projects: true, enquiries: true, convertedFromEnquiries: true, mergedFrom: true },
      },
    },
  })
  if (!client) return false
  const n = client._count
  return n.projects > 0 || n.enquiries > 0 || n.convertedFromEnquiries > 0 || n.mergedFrom > 0
}

/**
 * Result of a bulk "remove redundant clients" action: how many rows were deleted and how many were
 * kept back because they still hold real work.
 */
export type DeleteEmptyClientsResult = { deleted: number; skipped: number }

/**
 * Bulk-delete ONLY empty clients - the single safe delete path (there is no hard cascade any more) for
 * the multi-select "Delete" on the Clients list and the single-row Remove. A client is deletable only
 * when it has NO jobs, NO enquiries (neither a
 * current lead nor one that already converted), and NO other duplicate merged into it; any client that
 * fails the test is left untouched (counted in `skipped`), never cascade-deleted. This is deliberately
 * strict so the bulk control can never wipe out invoices, payments or job history the way the single
 * hard-delete can - staff use it to clear rows created by mistake, and must archive or open a real
 * client individually to remove it. The client's own trivial leftovers (contacts, notes, logged comms,
 * calendar holds) are cleared first so nothing is orphaned, then the row is removed - all per client in
 * one transaction, so a failure on one leaves the others (and that one) intact.
 */
export async function deleteEmptyClients(
  clientIds: string[],
  actorUserId: string,
): Promise<DeleteEmptyClientsResult> {
  const ids = Array.from(new Set(clientIds.map((id) => id.trim()).filter(Boolean)))
  if (ids.length === 0) return { deleted: 0, skipped: 0 }

  const candidates = await prisma.client.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      companyId: true,
      _count: {
        select: {
          projects: true, // any job (Project FK is Restrict - deleting would fail anyway)
          enquiries: true, // a lead currently pointing at this client
          convertedFromEnquiries: true, // an enquiry that already converted to this client
          mergedFrom: true, // another duplicate was merged into this one
        },
      },
    },
  })

  const deletable = candidates.filter(
    (c) =>
      c._count.projects === 0 &&
      c._count.enquiries === 0 &&
      c._count.convertedFromEnquiries === 0 &&
      c._count.mergedFrom === 0,
  )

  let deleted = 0
  for (const client of deletable) {
    await prisma.$transaction(async (tx) => {
      // Clear the client's own records first so SetNull FKs don't leave orphans behind.
      await tx.calendarEvent.deleteMany({ where: { clientId: client.id } })
      await tx.communication.deleteMany({ where: { clientId: client.id } })
      await tx.contact.deleteMany({ where: { clientId: client.id } })
      await tx.clientNote.deleteMany({ where: { clientId: client.id } })
      await tx.client.delete({ where: { id: client.id } })
      await tx.auditLog.create({
        data: {
          companyId: client.companyId,
          actorUserId,
          action: 'client.deleted',
          entityType: 'Client',
          entityId: client.id,
        },
      })
    })
    deleted++
  }

  // Anything not deleted - failed the safety test or was not found - is reported as skipped.
  return { deleted, skipped: ids.length - deleted }
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
