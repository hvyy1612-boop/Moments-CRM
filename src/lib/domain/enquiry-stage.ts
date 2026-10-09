import { prisma } from '@/lib/db'

/**
 * Stage <-> workflow sync (docs/24). A lead's (Enquiry's) early stage is DERIVED from its checklist so
 * "how far the workflow has gone" auto-reflects on the list. Only New enquiry / Contacted / Consultation
 * are derived; Quote sent, Awaiting booking confirmation, Booking confirmed and Declined come from real
 * events (send quote, accept, deposit paid, decline), never from ticking tasks.
 */

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

// Only the three EARLY stages are derived from the checklist. Quote sent / Awaiting booking / Booking
// confirmed are driven by real business events (send quote, accept, deposit paid), never by ticking a task.
export const OPEN_STAGE_ORDER = ['NEW_ENQUIRY', 'CONTACTED', 'CONSULTATION'] as const
export type OpenStage = (typeof OPEN_STAGE_ORDER)[number]
const OPEN = new Set<string>(OPEN_STAGE_ORDER)

type DeriveTask = { stage: string | null; status: string; type: string }

/** The three workflow groups map 1:1 to the three early open stages, in order. */
const GROUP_TO_STAGE: [string, OpenStage][] = [
  ['new', 'NEW_ENQUIRY'],
  ['discussion', 'CONTACTED'],
  ['quote', 'CONSULTATION'],
]

/**
 * Derive the open status from the checklist: the furthest section (New enquiry -> Contacted ->
 * Consultation) staff have ticked a task in, so whatever is ticked inside shows on the Leads list. Nothing
 * ticked = New enquiry. Custom stages do not map to a status.
 */
export function deriveOpenStage(tasks: DeriveTask[]): OpenStage {
  const ticked = tasks.filter((t) => t.type !== 'AUTO' && t.status === 'COMPLETED')
  let stage: OpenStage = 'NEW_ENQUIRY'
  for (const [group, s] of GROUP_TO_STAGE) {
    if (ticked.some((t) => t.stage === group)) stage = s
  }
  return stage
}

/**
 * After a checklist change, set the lead's status to match it, in BOTH directions (owner, 2026-10-10: the
 * list must show what is ticked inside; unticking moves it back). Only for the three checklist statuses -
 * Quote sent, Awaiting booking confirmation, a booked or an archived lead are never changed by ticking.
 */
export async function syncEnquiryStageFromTasks(tx: Tx, enquiryId: string, actorUserId: string) {
  const enquiry = await tx.enquiry.findUnique({
    where: { id: enquiryId },
    select: { status: true, companyId: true },
  })
  if (!enquiry || !OPEN.has(enquiry.status)) return // Quote sent and later come from real events
  const items = await tx.workItem.findMany({
    where: { enquiryId, status: { not: 'CANCELLED' } },
    select: { stage: true, status: true, type: true },
  })
  const derived = deriveOpenStage(items)
  if (derived === enquiry.status) return

  await tx.enquiry.update({ where: { id: enquiryId }, data: { status: derived } })
  await tx.auditLog.create({
    data: {
      companyId: enquiry.companyId,
      actorUserId,
      action: 'enquiry.stage_auto',
      entityType: 'Enquiry',
      entityId: enquiryId,
      beforeData: { status: enquiry.status },
      afterData: { status: derived },
    },
  })
}
