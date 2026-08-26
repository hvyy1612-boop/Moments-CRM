import { prisma } from '@/lib/db'
import { formatSydneyDate } from '@/lib/time'
import {
  buildProjectBoard,
  DEFAULT_PROJECT_TASKS,
  PROJECT_STAGE_KEYS,
  stageLabel,
  type ProjectBoard,
  type ProjectFacts,
  type TaskInput,
} from '@/features/projects/workflow'

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

const SEED_ACTION = 'project.workflow_seeded'

/** Seed the default suggested flow exactly once per project (guarded by a seed audit row), so deleting
 *  every task later does not make it re-appear. Due dates are set relative to the shoot when one exists. */
async function seedIfNeeded(tx: Tx, projectId: string, companyId: string, shootDate: Date | null) {
  const seeded = await tx.auditLog.count({
    where: { entityType: 'Project', entityId: projectId, action: SEED_ACTION },
  })
  if (seeded > 0) return
  await tx.workItem.createMany({
    data: DEFAULT_PROJECT_TASKS.map((t, i) => ({
      companyId,
      projectId,
      kind: 'TASK',
      stage: t.stage,
      title: t.title,
      status: 'PENDING' as const,
      order: i,
      dueAt: shootDate && t.dueOffsetDays != null ? new Date(shootDate.getTime() + t.dueOffsetDays * 86_400_000) : null,
    })),
  })
  await tx.auditLog.create({
    data: { companyId, action: SEED_ACTION, entityType: 'Project', entityId: projectId },
  })
}

/** Read the project's business facts + editable task rows and build the board. Seeds once on first read. */
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
    },
  })
  const shootDate = project.bookings[0]?.startsAt ?? null

  await prisma.$transaction((tx) => seedIfNeeded(tx, projectId, project.companyId, shootDate))

  const items = await prisma.workItem.findMany({
    where: { projectId },
    orderBy: { order: 'asc' },
    select: {
      id: true,
      title: true,
      status: true,
      stage: true,
      dueAt: true,
      order: true,
      completedAt: true,
      completedBy: { select: { name: true } },
    },
  })

  const quoteAccepted = project.quotes.some((q) => q.status === 'ACCEPTED')
  const contractSigned = project.contracts.some((c) => c.status === 'SIGNED')
  const depositPaid = project.invoices.some((i) => Number(i.amountPaid) > 0)
  const facts: ProjectFacts = {
    booked: quoteAccepted || contractSigned || depositPaid,
    shootScheduled: project.bookings.length > 0,
    galleryPrepared: project.galleries.length > 0,
    gallerySent: project.galleries.some((g) => g.status === 'PUBLISHED'),
  }

  const tasks: TaskInput[] = items.map((w) => ({
    id: w.id,
    title: w.title,
    status: w.status,
    stage: w.stage,
    dueAt: w.dueAt,
    order: w.order,
    completedByName: w.completedBy?.name ?? null,
    completedAt: w.completedAt ?? null,
  }))

  return buildProjectBoard(facts, tasks, shootDate, formatSydneyDate)
}

async function loadTask(taskId: string) {
  const task = await prisma.workItem.findUnique({
    where: { id: taskId },
    select: { id: true, projectId: true, companyId: true, stage: true, order: true, status: true, title: true },
  })
  if (!task || !task.projectId) throw new Error('Task not found.')
  return task
}

/** Add a task to a stage of a project's workflow. */
export async function addProjectTask(
  projectId: string,
  stage: string,
  title: string,
  dueAt: Date | null,
  actorUserId: string,
) {
  const clean = title.trim()
  if (!clean) throw new Error('A task needs a title.')
  if (!PROJECT_STAGE_KEYS.has(stage)) throw new Error('Unknown stage.')
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { companyId: true } })
    const last = await tx.workItem.findFirst({
      where: { projectId, stage },
      orderBy: { order: 'desc' },
      select: { order: true },
    })
    await tx.workItem.create({
      data: {
        companyId: project.companyId,
        projectId,
        kind: 'CUSTOM',
        stage,
        title: clean,
        status: 'PENDING',
        order: (last?.order ?? 0) + 1,
        dueAt,
      },
    })
    await tx.auditLog.create({
      data: {
        companyId: project.companyId,
        actorUserId,
        action: 'project.task_added',
        entityType: 'Project',
        entityId: projectId,
        afterData: { stage: stageLabel(stage), title: clean },
      },
    })
  })
}

/** Rename a task and/or change its due date. */
export async function updateProjectTask(taskId: string, title: string, dueAt: Date | null, actorUserId: string) {
  const clean = title.trim()
  if (!clean) throw new Error('A task needs a title.')
  const task = await loadTask(taskId)
  await prisma.$transaction(async (tx) => {
    await tx.workItem.update({ where: { id: taskId }, data: { title: clean, dueAt } })
    await tx.auditLog.create({
      data: {
        companyId: task.companyId,
        actorUserId,
        action: 'project.task_edited',
        entityType: 'Project',
        entityId: task.projectId!,
        afterData: { title: clean },
      },
    })
  })
}

/** Delete a task from the workflow. */
export async function deleteProjectTask(taskId: string, actorUserId: string) {
  const task = await loadTask(taskId)
  await prisma.$transaction(async (tx) => {
    await tx.workItem.delete({ where: { id: taskId } })
    await tx.auditLog.create({
      data: {
        companyId: task.companyId,
        actorUserId,
        action: 'project.task_deleted',
        entityType: 'Project',
        entityId: task.projectId!,
        afterData: { title: task.title },
      },
    })
  })
}

/** Move a task up or down within its stage (swaps order with the adjacent task). */
export async function moveProjectTask(taskId: string, direction: 'up' | 'down', actorUserId: string) {
  const task = await loadTask(taskId)
  const neighbour = await prisma.workItem.findFirst({
    where: {
      projectId: task.projectId,
      stage: task.stage,
      order: direction === 'up' ? { lt: task.order } : { gt: task.order },
    },
    orderBy: { order: direction === 'up' ? 'desc' : 'asc' },
    select: { id: true, order: true },
  })
  if (!neighbour) return
  await prisma.$transaction([
    prisma.workItem.update({ where: { id: task.id }, data: { order: neighbour.order } }),
    prisma.workItem.update({ where: { id: neighbour.id }, data: { order: task.order } }),
    prisma.auditLog.create({
      data: {
        companyId: task.companyId,
        actorUserId,
        action: 'project.task_moved',
        entityType: 'Project',
        entityId: task.projectId!,
      },
    }),
  ])
}

/** Toggle a task complete or reopen it. */
export async function toggleProjectTask(taskId: string, actorUserId: string) {
  const task = await loadTask(taskId)
  const completing = task.status !== 'COMPLETED'
  await prisma.$transaction(async (tx) => {
    await tx.workItem.update({
      where: { id: taskId },
      data: completing
        ? { status: 'COMPLETED', completedByUserId: actorUserId, completedAt: new Date() }
        : { status: 'PENDING', completedByUserId: null, completedAt: null },
    })
    await tx.auditLog.create({
      data: {
        companyId: task.companyId,
        actorUserId,
        action: completing ? 'project.task_completed' : 'project.task_reopened',
        entityType: 'Project',
        entityId: task.projectId!,
        afterData: { title: task.title },
      },
    })
  })
}
