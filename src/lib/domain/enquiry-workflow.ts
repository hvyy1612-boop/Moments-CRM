import { prisma } from '@/lib/db'
import { formatSydneyDate } from '@/lib/time'
import {
  buildEnquiryBoard,
  DEFAULT_ENQUIRY_TASKS,
  ENQUIRY_STAGE_KEYS,
  enquiryStageLabel,
  type EnquiryBoard,
  type TaskInput,
} from '@/features/enquiries/workflow'
import { syncEnquiryStageFromTasks } from './enquiry-stage'

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

const OPEN = new Set(['NEW_ENQUIRY', 'CONTACTED', 'CONSULTATION'])

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
  await tx.workItem.createMany({
    data: DEFAULT_ENQUIRY_TASKS.map((t, i) => ({
      companyId: enquiry.companyId,
      enquiryId: enquiry.id,
      kind: 'TASK',
      stage: t.stage,
      type: t.type,
      title: t.title,
      status: t.done ? ('COMPLETED' as const) : ('PENDING' as const),
      completedAt: t.done ? new Date() : null,
      order: i,
    })),
  })
}

export async function cancelOpenWorkItems(tx: Tx, enquiryId: string) {
  await tx.workItem.updateMany({
    where: { enquiryId, status: 'PENDING' },
    data: { status: 'CANCELLED' },
  })
}

export async function getEnquiryBoard(enquiryId: string): Promise<EnquiryBoard> {
  const enquiry = await prisma.enquiry.findUnique({
    where: { id: enquiryId },
    select: { createdAt: true, status: true, owner: { select: { name: true } } },
  })
  const booked = enquiry?.status === 'BOOKING_CONFIRMED'
  const items = await prisma.workItem.findMany({

    where: booked ? { enquiryId } : { enquiryId, status: { not: 'CANCELLED' } },
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
  return buildEnquiryBoard(tasks, formatSydneyDate, enquiry?.createdAt ?? null, new Date(), booked, enquiry?.owner?.name ?? null)
}

export async function sendStaffReply(enquiryId: string, body: string, actorUserId: string) {
  const text = body.trim()
  if (!text) throw new Error('A reply cannot be empty.')
  return prisma.$transaction(async (tx) => {
    const enquiry = await tx.enquiry.findUnique({ where: { id: enquiryId } })
    if (!enquiry) throw new Error('Lead not found.')
    if (!OPEN.has(enquiry.status)) throw new Error('This lead is already closed.')

    await tx.communication.create({
      data: { enquiryId, type: 'CLIENT_MESSAGE', direction: 'outbound', body: text, byUserId: actorUserId },
    })
    await tx.enquiry.update({
      where: { id: enquiryId },
      data: { status: enquiry.status === 'NEW_ENQUIRY' ? 'CONTACTED' : enquiry.status, waitingOn: 'CLIENT' },
    })
    await tx.auditLog.create({
      data: { companyId: enquiry.companyId, actorUserId, action: 'enquiry.replied', entityType: 'Enquiry', entityId: enquiryId },
    })
    return enquiry
  })
}

export async function logClientReply(enquiryId: string, body: string, actorUserId: string) {
  const text = body.trim()
  if (!text) throw new Error('The client message cannot be empty.')
  return prisma.$transaction(async (tx) => {
    const enquiry = await tx.enquiry.findUnique({ where: { id: enquiryId } })
    if (!enquiry) throw new Error('Lead not found.')
    if (!OPEN.has(enquiry.status)) throw new Error('This lead is already closed.')

    await tx.communication.create({
      data: { enquiryId, type: 'CLIENT_MESSAGE', direction: 'inbound', body: text, byUserId: null },
    })
    await tx.enquiry.update({ where: { id: enquiryId }, data: { waitingOn: 'STUDIO' } })
    await tx.auditLog.create({
      data: { companyId: enquiry.companyId, actorUserId, action: 'enquiry.client_replied', entityType: 'Enquiry', entityId: enquiryId },
    })
    return enquiry
  })
}

export async function addEnquiryNote(enquiryId: string, body: string, actorUserId: string) {
  const text = body.trim()
  if (!text) throw new Error('A note cannot be empty.')
  const enquiry = await prisma.enquiry.findUnique({ where: { id: enquiryId }, select: { id: true, companyId: true } })
  if (!enquiry) throw new Error('Lead not found.')
  await prisma.communication.create({
    data: { enquiryId, type: 'CLIENT_MESSAGE', direction: 'outbound', internal: true, body: text, byUserId: actorUserId },
  })
  await prisma.auditLog.create({
    data: { companyId: enquiry.companyId, actorUserId, action: 'enquiry.note_added', entityType: 'Enquiry', entityId: enquiryId },
  })
}

async function loadTask(taskId: string) {
  const task = await prisma.workItem.findUnique({
    where: { id: taskId },
    select: { id: true, enquiryId: true, companyId: true, stage: true, order: true, status: true, title: true, type: true },
  })
  if (!task || !task.enquiryId) throw new Error('Task not found.')
  return task
}

const ADDABLE = new Set(['TODO', 'AUTO_EMAIL', 'APPOINTMENT', 'SHOOT'])

export async function addEnquiryTask(
  enquiryId: string,
  stage: string,
  title: string,
  type: string,
  dueAt: Date | null,
  actorUserId: string,
) {
  const clean = title.trim()
  if (!clean) throw new Error('A task needs a title.')

  const stageKey = stage.trim()
  if (!stageKey || stageKey.length > 50) throw new Error('Please enter a valid stage.')
  const taskType = ADDABLE.has(type) ? type : 'TODO'
  return prisma.$transaction(async (tx) => {
    const enquiry = await tx.enquiry.findUniqueOrThrow({ where: { id: enquiryId }, select: { companyId: true } })
    const last = await tx.workItem.findFirst({
      where: { enquiryId, stage: stageKey },
      orderBy: { order: 'desc' },
      select: { order: true },
    })
    await tx.workItem.create({
      data: {
        companyId: enquiry.companyId,
        enquiryId,
        kind: 'CUSTOM',
        stage: stageKey,
        type: taskType,
        title: clean,
        status: 'PENDING',
        order: (last?.order ?? 0) + 1,
        dueAt,
      },
    })
    await tx.auditLog.create({
      data: {
        companyId: enquiry.companyId,
        actorUserId,
        action: 'enquiry.task_added',
        entityType: 'Enquiry',
        entityId: enquiryId,
        afterData: { stage: enquiryStageLabel(stageKey), title: clean },
      },
    })
  })
}

export async function addEnquiryStage(enquiryId: string, stageName: string, actorUserId: string) {
  const key = stageName.trim()
  if (!key || key.length > 50) throw new Error('Please enter a stage name.')
  if (ENQUIRY_STAGE_KEYS.has(key)) throw new Error('That stage already exists.')
  return prisma.$transaction(async (tx) => {
    const enquiry = await tx.enquiry.findUniqueOrThrow({ where: { id: enquiryId }, select: { companyId: true } })
    await tx.workItem.create({
      data: {
        companyId: enquiry.companyId,
        enquiryId,
        kind: 'CUSTOM',
        stage: key,
        type: 'TODO',
        title: 'New task',
        status: 'PENDING',
        order: 1,
        dueAt: null,
      },
    })
    await tx.auditLog.create({
      data: { companyId: enquiry.companyId, actorUserId, action: 'enquiry.stage_added', entityType: 'Enquiry', entityId: enquiryId, afterData: { stage: key } },
    })
  })
}

export async function renameEnquiryStage(enquiryId: string, fromStage: string, toStage: string, actorUserId: string) {
  const to = toStage.trim()
  if (!to || to.length > 50) throw new Error('Please enter a stage name.')
  if (ENQUIRY_STAGE_KEYS.has(fromStage) || ENQUIRY_STAGE_KEYS.has(to)) throw new Error('The core stages cannot be renamed.')
  return prisma.$transaction(async (tx) => {
    const enquiry = await tx.enquiry.findUniqueOrThrow({ where: { id: enquiryId }, select: { companyId: true } })
    const res = await tx.workItem.updateMany({ where: { enquiryId, stage: fromStage }, data: { stage: to } })
    if (res.count > 0) {
      await tx.auditLog.create({
        data: { companyId: enquiry.companyId, actorUserId, action: 'enquiry.stage_renamed', entityType: 'Enquiry', entityId: enquiryId, afterData: { from: fromStage, to } },
      })
    }
  })
}

export async function deleteEnquiryStage(enquiryId: string, stage: string, actorUserId: string) {
  if (ENQUIRY_STAGE_KEYS.has(stage)) throw new Error('The core stages cannot be deleted.')
  return prisma.$transaction(async (tx) => {
    const enquiry = await tx.enquiry.findUniqueOrThrow({ where: { id: enquiryId }, select: { companyId: true } })
    const res = await tx.workItem.deleteMany({ where: { enquiryId, stage } })
    if (res.count > 0) {
      await tx.auditLog.create({
        data: { companyId: enquiry.companyId, actorUserId, action: 'enquiry.stage_deleted', entityType: 'Enquiry', entityId: enquiryId, afterData: { stage } },
      })
    }
  })
}

export async function updateEnquiryTask(taskId: string, title: string, dueAt: Date | null, actorUserId: string) {
  const clean = title.trim()
  if (!clean) throw new Error('A task needs a title.')
  const task = await loadTask(taskId)
  await prisma.$transaction(async (tx) => {
    await tx.workItem.update({ where: { id: taskId }, data: { title: clean, dueAt } })
    await tx.auditLog.create({
      data: { companyId: task.companyId, actorUserId, action: 'enquiry.task_edited', entityType: 'Enquiry', entityId: task.enquiryId!, afterData: { title: clean } },
    })
  })
}

export async function deleteEnquiryTask(taskId: string, actorUserId: string) {
  const task = await loadTask(taskId)
  await prisma.$transaction(async (tx) => {
    await tx.workItem.delete({ where: { id: taskId } })
    await tx.auditLog.create({
      data: { companyId: task.companyId, actorUserId, action: 'enquiry.task_deleted', entityType: 'Enquiry', entityId: task.enquiryId!, afterData: { title: task.title } },
    })
  })
}

export async function moveEnquiryTask(taskId: string, direction: 'up' | 'down', actorUserId: string) {
  const task = await loadTask(taskId)
  const neighbour = await prisma.workItem.findFirst({
    where: {
      enquiryId: task.enquiryId,
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
      data: { companyId: task.companyId, actorUserId, action: 'enquiry.task_moved', entityType: 'Enquiry', entityId: task.enquiryId! },
    }),
  ])
}

export async function toggleEnquiryTask(taskId: string, actorUserId: string) {
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
        action: completing ? 'enquiry.task_completed' : 'enquiry.task_reopened',
        entityType: 'Enquiry',
        entityId: task.enquiryId!,
        afterData: { title: task.title },
      },
    })

    await syncEnquiryStageFromTasks(tx, task.enquiryId!, actorUserId)
  })
}
