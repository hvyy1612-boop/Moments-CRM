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
 * Derive the open stage from the checklist: it is the group of the earliest incomplete task, walking
 * New enquiry -> Contacted -> Consultation. Empty groups are skipped, so it works for any per-case task
 * set. When everything is done the lead sits at Consultation until a real event moves it on.
 */
export function deriveOpenStage(tasks: DeriveTask[]): OpenStage {
  const real = tasks.filter((t) => t.type !== 'AUTO')
  for (const [group, stage] of GROUP_TO_STAGE) {
    const groupTasks = real.filter((t) => t.stage === group)
    if (groupTasks.some((t) => t.status !== 'COMPLETED')) return stage
  }
  return 'CONSULTATION'
}

/**
 * After a checklist change, nudge the enquiry's stage FORWARD to match the workflow. Forward-only so a
 * manual correction (or a reopened task) is never silently undone; demoting is done by hand. No-op for
 * closed leads (converted / lost) and when the derived stage is not ahead of the current one.
 */
export async function syncEnquiryStageFromTasks(tx: Tx, enquiryId: string, actorUserId: string) {
  const enquiry = await tx.enquiry.findUnique({
    where: { id: enquiryId },
    select: { status: true, companyId: true },
  })
  if (!enquiry || !OPEN.has(enquiry.status)) return
  const items = await tx.workItem.findMany({
    where: { enquiryId, status: { not: 'CANCELLED' } },
    select: { stage: true, status: true, type: true },
  })
  const derived = deriveOpenStage(items)
  if (OPEN_STAGE_ORDER.indexOf(derived) <= OPEN_STAGE_ORDER.indexOf(enquiry.status as OpenStage)) return

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
