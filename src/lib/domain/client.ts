import { prisma } from '@/lib/db'
import type { ClientInput } from '@/lib/validation/client'
import { requireCompany } from './project'
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
 * True when a client carries real history - any job or any enquiry (a current lead or one that already
 * converted). Such a client is NEVER hard-deleted: the "Remove"
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
        select: { projects: true, enquiries: true, convertedFromEnquiries: true },
      },
    },
  })
  if (!client) return false
  const n = client._count
  return n.projects > 0 || n.enquiries > 0 || n.convertedFromEnquiries > 0
}

/**
 * Result of a bulk "remove redundant clients" action: how many rows were deleted and how many were
 * kept back because they still hold real work.
 */
export type DeleteEmptyClientsResult = { deleted: number; skipped: number }

/**
 * Bulk-delete ONLY empty clients - the single safe delete path (there is no hard cascade any more) for
 * the multi-select "Delete" on the Clients list and the single-row Remove. A client is deletable only
 * when it has NO jobs and NO enquiries (neither a current lead nor one that already converted); any client that
 * fails the test is left untouched (counted in `skipped`), never cascade-deleted. This is deliberately
 * strict so the bulk control can never wipe out invoices, payments or job history the way the single
 * hard-delete can - staff use it to clear rows created by mistake, and must archive or open a real
 * client individually to remove it. The client's own trivial leftovers (logged comms, calendar holds)
 * are cleared first so nothing is orphaned, then the row is removed - all per client in
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
        },
      },
    },
  })

  const deletable = candidates.filter(
    (c) =>
      c._count.projects === 0 &&
      c._count.enquiries === 0 &&
      c._count.convertedFromEnquiries === 0,
  )

  let deleted = 0
  for (const client of deletable) {
    await prisma.$transaction(async (tx) => {
      // Clear the client's own records first so SetNull FKs don't leave orphans behind.
      await tx.calendarEvent.deleteMany({ where: { clientId: client.id } })
      await tx.communication.deleteMany({ where: { clientId: client.id } })
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
