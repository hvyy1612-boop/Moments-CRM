import { prisma } from '@/lib/db'
import { systemClock } from '@/lib/time'

/**
 * Merge a duplicate client into a survivor (F-ENQ-05). Staff-confirmed only — the app never auto-
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
