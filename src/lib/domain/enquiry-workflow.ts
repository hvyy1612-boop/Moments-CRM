import { prisma } from '@/lib/db'
import { workItemTitle } from '@/features/enquiries/workflow'

/** Interactive-transaction client type carrying the db.ts extensions. */
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

const OPEN = new Set(['NEW', 'CONTACTED', 'QUALIFIED'])

type StageChange = { status?: 'NEW' | 'CONTACTED' | 'QUALIFIED'; waitingOn?: 'STUDIO' | 'CLIENT' | null }

async function addWorkItem(tx: Tx, enquiry: { id: string; companyId: string }, kind: string) {
  const order = await tx.workItem.count({ where: { enquiryId: enquiry.id } })
  return tx.workItem.create({
    data: { companyId: enquiry.companyId, enquiryId: enquiry.id, kind, title: workItemTitle(kind), order },
  })
}

/** Runs inside createEnquiry's transaction: store the client's first message and open the first task. */
export async function seedEnquiryWorkflow(
  tx: Tx,
  enquiry: { id: string; companyId: string; message: string | null; source: string | null },
) {
  if (enquiry.message && enquiry.message.trim()) {
    await tx.communication.create({
      data: {
        enquiryId: enquiry.id,
        type: 'CLIENT_MESSAGE',
        direction: 'inbound',
        body: enquiry.message,
        channel: enquiry.source === 'WEBSITE' ? 'WEBSITE' : (enquiry.source ?? null),
      },
    })
  }
  await addWorkItem(tx, enquiry, 'REVIEW_ENQUIRY')
}

/** Close any outstanding tasks when a lead leaves the active queue (converted / lost). */
export async function cancelOpenWorkItems(tx: Tx, enquiryId: string) {
  await tx.workItem.updateMany({
    where: { enquiryId, status: 'PENDING' },
    data: { status: 'CANCELLED' },
  })
}

/**
 * Complete a tickable work item and run the resulting transition (contract docs/23 §7). The event is
 * "this task is done"; the effect (next task, stage, waiting) is decided here on the server.
 */
export async function completeWorkItem(workItemId: string, actorUserId: string) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.workItem.findUnique({ where: { id: workItemId }, include: { enquiry: true } })
    if (!item || !item.enquiry) throw new Error('Work item not found.')
    if (item.status !== 'PENDING') return item
    const enquiry = item.enquiry

    await tx.workItem.update({
      where: { id: item.id },
      data: { status: 'COMPLETED', completedByUserId: actorUserId, completedAt: new Date() },
    })

    let change: StageChange = {}
    let nextKind: string | null = null
    switch (item.kind) {
      case 'REVIEW_ENQUIRY':
        change = { waitingOn: 'STUDIO' }
        nextKind = 'REPLY_TO_CLIENT'
        break
      case 'REVIEW_CLIENT_REPLY':
        // Reviewing a client reply keeps the case in discussion: the studio replies again. The move
        // to a quote is a deliberate staff decision (startQuoting), not an automatic jump.
        change = { status: 'CONTACTED', waitingOn: 'STUDIO' }
        nextKind = 'REPLY_TO_CLIENT'
        break
      case 'PREPARE_QUOTE':
        change = { status: 'QUALIFIED', waitingOn: 'STUDIO' }
        nextKind = 'SEND_QUOTE'
        break
      case 'SEND_QUOTE':
        change = { waitingOn: 'CLIENT' }
        break
      case 'REPLY_TO_CLIENT':
        change = { status: 'CONTACTED', waitingOn: 'CLIENT' }
        break
      default:
        break
    }

    if (Object.keys(change).length > 0) {
      await tx.enquiry.update({ where: { id: enquiry.id }, data: change })
    }
    if (nextKind) await addWorkItem(tx, enquiry, nextKind)

    await tx.auditLog.create({
      data: {
        companyId: enquiry.companyId,
        actorUserId,
        action: 'enquiry.work_item_completed',
        entityType: 'Enquiry',
        entityId: enquiry.id,
        afterData: { kind: item.kind, next: nextKind },
      },
    })
    return item
  })
}

/** Staff sends a reply: records an outbound message, completes the reply task, moves the ball to the
 * client. A brand-new lead advances to CONTACTED (does not demote a later stage). */
export async function sendStaffReply(enquiryId: string, body: string, actorUserId: string) {
  const text = body.trim()
  if (!text) throw new Error('A reply cannot be empty.')
  return prisma.$transaction(async (tx) => {
    const enquiry = await tx.enquiry.findUnique({ where: { id: enquiryId } })
    if (!enquiry) throw new Error('Enquiry not found.')
    if (!OPEN.has(enquiry.status)) throw new Error('This enquiry is already closed.')

    await tx.communication.create({
      data: { enquiryId, type: 'CLIENT_MESSAGE', direction: 'outbound', body: text, byUserId: actorUserId },
    })
    await tx.workItem.updateMany({
      where: { enquiryId, kind: 'REPLY_TO_CLIENT', status: 'PENDING' },
      data: { status: 'COMPLETED', completedByUserId: actorUserId, completedAt: new Date() },
    })
    await tx.enquiry.update({
      where: { id: enquiryId },
      data: { status: enquiry.status === 'NEW' ? 'CONTACTED' : enquiry.status, waitingOn: 'CLIENT' },
    })
    await tx.auditLog.create({
      data: {
        companyId: enquiry.companyId,
        actorUserId,
        action: 'enquiry.replied',
        entityType: 'Enquiry',
        entityId: enquiryId,
      },
    })
    return enquiry
  })
}

/**
 * Staff decides the discussion is settled and moves the case into quoting. Cancels the outstanding
 * discussion task so the board keeps a single current task, then opens "Prepare quote".
 */
export async function startQuoting(enquiryId: string, actorUserId: string) {
  return prisma.$transaction(async (tx) => {
    const enquiry = await tx.enquiry.findUnique({ where: { id: enquiryId } })
    if (!enquiry) throw new Error('Enquiry not found.')
    if (enquiry.status !== 'CONTACTED') throw new Error('This enquiry is not in the discussion stage.')

    await cancelOpenWorkItems(tx, enquiryId)
    await tx.enquiry.update({ where: { id: enquiryId }, data: { status: 'QUALIFIED', waitingOn: 'STUDIO' } })
    await addWorkItem(tx, { id: enquiry.id, companyId: enquiry.companyId }, 'PREPARE_QUOTE')
    await tx.auditLog.create({
      data: {
        companyId: enquiry.companyId,
        actorUserId,
        action: 'enquiry.moved_to_quote',
        entityType: 'Enquiry',
        entityId: enquiryId,
      },
    })
    return enquiry
  })
}

/** Record a message from the client: the ball moves back to the studio and a review task opens. */
export async function logClientReply(enquiryId: string, body: string, actorUserId: string) {
  const text = body.trim()
  if (!text) throw new Error('The client message cannot be empty.')
  return prisma.$transaction(async (tx) => {
    const enquiry = await tx.enquiry.findUnique({ where: { id: enquiryId } })
    if (!enquiry) throw new Error('Enquiry not found.')
    if (!OPEN.has(enquiry.status)) throw new Error('This enquiry is already closed.')

    await tx.communication.create({
      data: { enquiryId, type: 'CLIENT_MESSAGE', direction: 'inbound', body: text, byUserId: null },
    })
    await tx.enquiry.update({ where: { id: enquiryId }, data: { waitingOn: 'STUDIO' } })
    await addWorkItem(tx, enquiry, 'REVIEW_CLIENT_REPLY')
    await tx.auditLog.create({
      data: {
        companyId: enquiry.companyId,
        actorUserId,
        action: 'enquiry.client_replied',
        entityType: 'Enquiry',
        entityId: enquiryId,
      },
    })
    return enquiry
  })
}
