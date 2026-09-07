import { prisma } from '@/lib/db'

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

export const OPEN_STAGE_ORDER = ['NEW', 'CONTACTED', 'QUALIFIED'] as const
export type OpenStage = (typeof OPEN_STAGE_ORDER)[number]
const OPEN = new Set<string>(OPEN_STAGE_ORDER)

type DeriveTask = { stage: string | null; status: string; type: string }

const GROUP_TO_STAGE: [string, OpenStage][] = [
  ['new', 'NEW'],
  ['discussion', 'CONTACTED'],
  ['quote', 'QUALIFIED'],
]

export function deriveOpenStage(tasks: DeriveTask[]): OpenStage {
  const real = tasks.filter((t) => t.type !== 'AUTO')
  for (const [group, stage] of GROUP_TO_STAGE) {
    const groupTasks = real.filter((t) => t.stage === group)
    if (groupTasks.some((t) => t.status !== 'COMPLETED')) return stage
  }
  return 'QUALIFIED'
}

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
