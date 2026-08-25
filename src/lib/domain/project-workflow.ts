import { prisma } from '@/lib/db'
import {
  buildProjectBoard,
  projectWorkItemGroup,
  projectWorkItemTitle,
  PROJECT_WORKITEM_KINDS,
  type CompletedWorkItem,
  type ProjectBoard,
  type ProjectFacts,
} from '@/features/projects/workflow'

/**
 * Read the project's real business records and its completed work items, then build the board. The
 * board is a pure reflection of backend state (contract docs/23): facts come from Quote / Contract /
 * Invoice / Booking / Gallery; staff steps come from completed WorkItems. Nothing is invented here.
 */
export async function getProjectBoard(projectId: string): Promise<ProjectBoard> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      quotes: { select: { status: true } },
      contracts: { select: { status: true } },
      invoices: { select: { amountPaid: true } },
      galleries: { select: { status: true } },
      _count: { select: { bookings: true } },
      workItems: {
        where: { status: 'COMPLETED' },
        select: { kind: true, completedAt: true, completedBy: { select: { name: true } } },
      },
    },
  })

  const facts: ProjectFacts = {
    quoteAccepted: project.quotes.some((q) => q.status === 'ACCEPTED'),
    contractSigned: project.contracts.some((c) => c.status === 'SIGNED'),
    depositPaid: project.invoices.some((i) => Number(i.amountPaid) > 0),
    shootScheduled: project._count.bookings > 0,
    galleryPrepared: project.galleries.length > 0,
    gallerySent: project.galleries.some((g) => g.status === 'PUBLISHED'),
  }

  const completed = new Map<string, CompletedWorkItem>()
  for (const item of project.workItems) {
    // Keep the most recent completion for a kind if it somehow recurs.
    const existing = completed.get(item.kind)
    if (!existing || (item.completedAt?.getTime() ?? 0) > (existing.at?.getTime() ?? 0)) {
      completed.set(item.kind, { name: item.completedBy?.name ?? null, at: item.completedAt })
    }
  }

  return buildProjectBoard(facts, completed)
}

/**
 * Complete the current staff work item on a project. The transition is server-owned: it verifies the
 * kind IS the board's current actionable step (so steps cannot be completed out of order or twice),
 * records who/when as a completed WorkItem, and writes the audit row. It does NOT touch ProjectLifecycle
 * - the existing business rules (contract signed, gallery created/published) keep owning that.
 */
export async function completeProjectStep(projectId: string, kind: string, actorUserId: string) {
  if (!PROJECT_WORKITEM_KINDS.has(kind)) throw new Error('Unknown work item.')

  const board = await getProjectBoard(projectId)
  if (board.currentKind !== kind) {
    // Idempotent no-op if it is already done; a real out-of-order attempt is rejected.
    if (board.groups.some((g) => g.steps.some((s) => s.kind === kind && s.state === 'done'))) return
    throw new Error('That step is not the current action.')
  }

  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { companyId: true },
    })
    const order = await tx.workItem.count({ where: { projectId } })
    await tx.workItem.create({
      data: {
        companyId: project.companyId,
        projectId,
        kind,
        title: projectWorkItemTitle(kind),
        status: 'COMPLETED',
        order,
        completedByUserId: actorUserId,
        completedAt: new Date(),
      },
    })
    await tx.auditLog.create({
      data: {
        companyId: project.companyId,
        actorUserId,
        action: 'project.work_item_completed',
        entityType: 'Project',
        entityId: projectId,
        afterData: { kind, group: projectWorkItemGroup(kind) },
      },
    })
  })
}
