import { prisma } from '@/lib/db'
import { formatSydneyDate } from '@/lib/time'
import {
  buildProjectBoard,
  DEFAULT_PROJECT_TASKS,
  OPTIONAL_STAGE_TASKS,
  PROJECT_STAGE_KEYS,
  PROJECT_STAGES,
  stageLabel,
  type ProjectBoard,
  type ProjectFacts,
  type TaskInput,
} from '@/features/projects/workflow'

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

const SEED_ACTION = 'project.workflow_seeded'

async function seedIfNeeded(tx: Tx, projectId: string, companyId: string) {
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
      type: t.type,
      title: t.title,
      status: 'PENDING' as const,
      order: i,
    })),
  })
  await tx.auditLog.create({
    data: { companyId, action: SEED_ACTION, entityType: 'Project', entityId: projectId },
  })
}

export async function seedProjectWorkflow(projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { companyId: true } })
  await prisma.$transaction((tx) => seedIfNeeded(tx, projectId, project.companyId))
}

export async function getProjectBoard(projectId: string): Promise<ProjectBoard> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      companyId: true,
      invoices: { select: { total: true, amountPaid: true } },
      galleries: { select: { status: true } },
      bookings: { orderBy: { startsAt: 'desc' }, take: 1, select: { startsAt: true } },
    },
  })

  await prisma.$transaction((tx) => seedIfNeeded(tx, projectId, project.companyId))

  const items = await prisma.workItem.findMany({
    where: { projectId },
    orderBy: { order: 'asc' },
    select: {
      id: true,
      title: true,
      status: true,
      stage: true,
      type: true,
      dueAt: true,
      order: true,
      completedAt: true,
      completedBy: { select: { name: true } },
    },
  })

  const totalInvoiced = project.invoices.reduce((s, i) => s + Number(i.total), 0)
  const totalPaid = project.invoices.reduce((s, i) => s + Number(i.amountPaid), 0)
  const facts: ProjectFacts = {
    gallerySent: project.galleries.some((g) => g.status === 'PUBLISHED'),
    finalPaid: totalInvoiced > 0 && totalPaid >= totalInvoiced,
  }

  const tasks: TaskInput[] = items.map((w) => ({
    id: w.id,
    title: w.title,
    status: w.status,
    stage: w.stage,
    type: w.type,
    dueAt: w.dueAt,
    order: w.order,
    completedByName: w.completedBy?.name ?? null,
    completedAt: w.completedAt ?? null,
  }))

  return buildProjectBoard(facts, tasks, formatSydneyDate, project.bookings[0]?.startsAt ?? null)
}

async function loadTask(taskId: string) {
  const task = await prisma.workItem.findUnique({
    where: { id: taskId },
    select: { id: true, projectId: true, companyId: true, stage: true, order: true, status: true, title: true, type: true },
  })
  if (!task || !task.projectId) throw new Error('Task not found.')
  return task
}

export async function addProjectStageBlock(projectId: string, stage: string, actorUserId: string) {
  const def = PROJECT_STAGES.find((s) => s.key === stage)
  const block = OPTIONAL_STAGE_TASKS[stage]
  if (!def || !def.optional || !block) throw new Error('Not an optional stage.')
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { companyId: true } })
    const existing = await tx.workItem.count({ where: { projectId, stage } })
    if (existing > 0) return
    await tx.workItem.createMany({
      data: block.map((t, i) => ({
        companyId: project.companyId,
        projectId,
        kind: 'TASK',
        stage,
        type: t.type,
        title: t.title,
        status: 'PENDING' as const,
        order: i,
      })),
    })
    await tx.auditLog.create({
      data: {
        companyId: project.companyId,
        actorUserId,
        action: 'project.stage_block_added',
        entityType: 'Project',
        entityId: projectId,
        afterData: { stage: stageLabel(stage) },
      },
    })
  })
}

const ADDABLE = new Set(['TODO', 'AUTO_EMAIL', 'APPOINTMENT', 'SHOOT'])

export async function addProjectTask(
  projectId: string,
  stage: string,
  title: string,
  type: string,
  dueAt: Date | null,
  actorUserId: string,
) {
  const clean = title.trim()
  if (!clean) throw new Error('A task needs a title.')
  if (!PROJECT_STAGE_KEYS.has(stage)) throw new Error('Unknown stage.')
  const taskType = ADDABLE.has(type) ? type : 'TODO'
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
        type: taskType,
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

export async function toggleProjectTask(taskId: string, actorUserId: string) {
  const task = await loadTask(taskId)
  if (task.type === 'AUTO') return
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
