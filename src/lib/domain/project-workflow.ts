import { prisma } from '@/lib/db'
import { formatSydneyDate } from '@/lib/time'
import {
  buildProjectBoard,
  PROJECT_TASK_KINDS,
  PROJECT_TASKS,
  type ProjectBoard,
  type ProjectFacts,
  type WorkItemLite,
} from '@/features/projects/workflow'

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

export async function seedProjectWorkflow(tx: Tx, projectId: string, companyId: string) {
  const existing = await tx.workItem.findMany({
    where: { projectId, kind: { in: [...PROJECT_TASK_KINDS] } },
    select: { kind: true },
  })
  const have = new Set(existing.map((e) => e.kind))
  const missing = PROJECT_TASKS.filter((t) => !have.has(t.kind))
  if (missing.length === 0) return
  await tx.workItem.createMany({
    data: missing.map((t) => ({
      companyId,
      projectId,
      kind: t.kind,
      title: t.title,
      status: 'PENDING' as const,
      order: t.order,
    })),
  })
}

export async function getProjectBoard(projectId: string): Promise<ProjectBoard> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      companyId: true,
      quotes: { select: { status: true } },
      contracts: { select: { status: true } },
      invoices: { select: { amountPaid: true } },
      galleries: { select: { status: true } },
      bookings: { orderBy: { startsAt: 'asc' }, take: 1, select: { startsAt: true } },
      workItems: {
        where: { kind: { in: [...PROJECT_TASK_KINDS] } },
        select: { id: true, kind: true, status: true, completedAt: true, completedBy: { select: { name: true } } },
      },
    },
  })

  if (project.workItems.length < PROJECT_TASKS.length) {
    await prisma.$transaction((tx) => seedProjectWorkflow(tx, projectId, project.companyId))
    return getProjectBoard(projectId)
  }

  const quoteAccepted = project.quotes.some((q) => q.status === 'ACCEPTED')
  const contractSigned = project.contracts.some((c) => c.status === 'SIGNED')
  const depositPaid = project.invoices.some((i) => Number(i.amountPaid) > 0)
  const facts: ProjectFacts = {
    booked: quoteAccepted || contractSigned || depositPaid,
    shootScheduled: project.bookings.length > 0,
    galleryPrepared: project.galleries.length > 0,
    gallerySent: project.galleries.some((g) => g.status === 'PUBLISHED'),
  }

  const items: WorkItemLite[] = project.workItems.map((w) => ({
    id: w.id,
    kind: w.kind,
    status: w.status,
    completedAt: w.completedAt,
    completedByName: w.completedBy?.name ?? null,
  }))

  const shootDate = project.bookings[0]?.startsAt ?? null
  return buildProjectBoard(facts, items, shootDate, formatSydneyDate)
}

export async function toggleProjectTask(workItemId: string, actorUserId: string) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.workItem.findUnique({
      where: { id: workItemId },
      select: { id: true, kind: true, status: true, projectId: true, companyId: true, title: true },
    })
    if (!item || !item.projectId) throw new Error('Task not found.')
    if (!PROJECT_TASK_KINDS.has(item.kind)) throw new Error('Not a project task.')

    const completing = item.status !== 'COMPLETED'
    await tx.workItem.update({
      where: { id: item.id },
      data: completing
        ? { status: 'COMPLETED', completedByUserId: actorUserId, completedAt: new Date() }
        : { status: 'PENDING', completedByUserId: null, completedAt: null },
    })
    await tx.auditLog.create({
      data: {
        companyId: item.companyId,
        actorUserId,
        action: completing ? 'project.task_completed' : 'project.task_reopened',
        entityType: 'Project',
        entityId: item.projectId,
        afterData: { kind: item.kind, title: item.title },
      },
    })
  })
}
