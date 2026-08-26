import type { ContactRole } from '@prisma/client'
import { prisma } from '@/lib/db'

/**
 * Contacts (F-CLIENT-02): one client can have several contacts (a couple, a billing person, the
 * signer). A client should always have exactly one PRIMARY contact - the first contact added becomes
 * primary automatically, and setting a new primary clears the old one.
 */

export type ContactInput = {
  name: string
  email?: string | null
  phone?: string | null
  role?: ContactRole
  isPrimary?: boolean
  isBilling?: boolean
  canAccessPortal?: boolean
}

export async function addContact(
  clientId: string,
  input: ContactInput,
  actorUserId: string | null = null,
) {
  return prisma.$transaction(async (tx) => {
    const client = await tx.client.findUnique({ where: { id: clientId } })
    if (!client) throw new Error('Client not found.')

    const existingCount = await tx.contact.count({ where: { clientId } })
    const makePrimary = input.isPrimary === true || existingCount === 0
    if (makePrimary) {
      await tx.contact.updateMany({
        where: { clientId, isPrimary: true },
        data: { isPrimary: false },
      })
    }

    const contact = await tx.contact.create({
      data: {
        clientId,
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        role: input.role ?? (makePrimary ? 'PRIMARY' : 'OTHER'),
        isPrimary: makePrimary,
        isBilling: input.isBilling ?? false,
        canAccessPortal: input.canAccessPortal ?? true,
      },
    })
    await tx.auditLog.create({
      data: {
        companyId: client.companyId,
        action: 'contact.added',
        entityType: 'Contact',
        entityId: contact.id,
        actorUserId,
        afterData: { clientId, isPrimary: contact.isPrimary, role: contact.role },
      },
    })
    return contact
  })
}

/** Make a contact the client's single PRIMARY, clearing the previous primary. */
export async function setPrimaryContact(contactId: string, actorUserId: string | null = null) {
  return prisma.$transaction(async (tx) => {
    const contact = await tx.contact.findUnique({
      where: { id: contactId },
      include: { client: { select: { companyId: true } } },
    })
    if (!contact) throw new Error('Contact not found.')

    await tx.contact.updateMany({
      where: { clientId: contact.clientId, isPrimary: true },
      data: { isPrimary: false },
    })
    const updated = await tx.contact.update({
      where: { id: contactId },
      data: { isPrimary: true, role: 'PRIMARY' },
    })
    await tx.auditLog.create({
      data: {
        companyId: contact.client.companyId,
        action: 'contact.set_primary',
        entityType: 'Contact',
        entityId: contactId,
        actorUserId,
      },
    })
    return updated
  })
}

/** Edit a contact's fields/flags. Does not change which contact is primary (use setPrimaryContact). */
export async function updateContact(
  contactId: string,
  input: Partial<Omit<ContactInput, 'isPrimary'>>,
  actorUserId: string | null = null,
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.contact.findUnique({
      where: { id: contactId },
      include: { client: { select: { companyId: true } } },
    })
    if (!existing) throw new Error('Contact not found.')

    const contact = await tx.contact.update({
      where: { id: contactId },
      data: {
        name: input.name ?? undefined,
        email: input.email === undefined ? undefined : input.email,
        phone: input.phone === undefined ? undefined : input.phone,
        role: input.role ?? undefined,
        isBilling: input.isBilling ?? undefined,
        canAccessPortal: input.canAccessPortal ?? undefined,
      },
    })
    await tx.auditLog.create({
      data: {
        companyId: existing.client.companyId,
        action: 'contact.updated',
        entityType: 'Contact',
        entityId: contactId,
        actorUserId,
      },
    })
    return contact
  })
}

/** All contacts for a client, primary first. */
export async function listContacts(clientId: string) {
  return prisma.contact.findMany({
    where: { clientId },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  })
}
