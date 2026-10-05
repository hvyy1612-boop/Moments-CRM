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

/** Interactive-transaction client type. */
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

const OPEN = new Set(['NEW_ENQUIRY', 'CONTACTED', 'CONSULTATION'])

/** Runs inside createEnquiry's transaction: store the client's first message and seed the default flow. */
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

/** Close any outstanding tasks when a lead leaves the active queue (converted / lost). */
export async function cancelOpenWorkItems(tx: Tx, enquiryId: string) {
  await tx.workItem.updateMany({
    where: { enquiryId, status: 'PENDING' },
    data: { status: 'CANCELLED' },
  })
}

/** Read the enquiry's tasks and build the board. A booked (converted) enquiry is a finished record: the
 *  board shows the FULL checklist - including tasks closed out on booking - as all ticked, read-only, so
 *  any staff member can see what the sales phase covered. */
export async function getEnquiryBoard(enquiryId: string): Promise<EnquiryBoard> {
  const enquiry = await prisma.enquiry.findUnique({
    where: { id: enquiryId },
    select: { createdAt: true, status: true, owner: { select: { name: true } } },
  })
  const booked = enquiry?.status === 'BOOKING_CONFIRMED'
  const items = await prisma.workItem.findMany({
    // Live enquiry: hide tasks dropped from the flow. Booked: include them all - the record is complete.
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

/** Staff sends a reply: records an outbound message and moves the ball to the client. A brand-new lead
 *  advances to CONTACTED (does not demote a later stage). */
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

/** Record a message from the client: the ball moves back to the studio. */
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

/** Add an internal team note to a lead (never client-facing). Allowed at any status. */
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

/** Add a task to a stage of the enquiry workflow. */
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
  // A core stage key, or a per-lead custom stage (a free group name, e.g. "Album design").
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

/**
 * Per-lead custom stages (extra workflow groups beyond the fixed core three). A stage exists as long as
 * it has at least one task, so "add" seeds a starter task, "rename" re-keys the group, and "delete"
 * removes the group's tasks. The three core stages drive the lead's status and are never touched here.
 */
export async function addEnquiryStage(enquiryId: string, stageName: string, actorUserId: string) {
  const key = stageName.trim()
  if (!key || key.length > 50) throw new Error('Please enter a stage name.')
  if (ENQUIRY_STAGE_KEYS.has(key)) throw new Error('That stage already exists.')
  return prisma.$transaction(async (tx) => {
    const enquiry = await tx.enquiry.findUniqueOrThrow({ where: { id: enquiryId }, select: { companyId: true } })
    if (await tx.workItem.count({ where: { enquiryId, stage: key } })) throw new Error('A stage with that name already exists.')
    // Placed after every existing task, so a new stage always lists after the stages already there.
    const last = await tx.workItem.aggregate({ where: { enquiryId }, _max: { order: true } })
    await tx.workItem.create({
      data: {
        companyId: enquiry.companyId,
        enquiryId,
        kind: 'CUSTOM',
        stage: key,
        type: 'TODO',
        title: 'New task',
        status: 'PENDING',
        order: (last._max.order ?? 0) + 1,
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
    if (to !== fromStage && (await tx.workItem.count({ where: { enquiryId, stage: to } }))) throw new Error('A stage with that name already exists.')
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
    await syncEnquiryStageFromTasks(tx, enquiryId, actorUserId)
  })
}

/** Rename a task and/or change its due date. */
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

/** Delete a task from the workflow. */
export async function deleteEnquiryTask(taskId: string, actorUserId: string) {
  const task = await loadTask(taskId)
  await prisma.$transaction(async (tx) => {
    await tx.workItem.delete({ where: { id: taskId } })
    await tx.auditLog.create({
      data: { companyId: task.companyId, actorUserId, action: 'enquiry.task_deleted', entityType: 'Enquiry', entityId: task.enquiryId!, afterData: { title: task.title } },
    })
    // Removing the last open task of a stage moves the lead on, exactly as ticking it would.
    await syncEnquiryStageFromTasks(tx, task.enquiryId!, actorUserId)
  })
}

/** Move a task up or down within its stage. */
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

/** Toggle a task complete or reopen it. */
export async function toggleEnquiryTask(taskId: string, actorUserId: string) {
  const task = await loadTask(taskId)
  if (task.type === 'AUTO') return // auto rows are system-driven, not staff-toggled
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
    // The stage follows the workflow: completing tasks nudges the open stage forward (docs/24).
    await syncEnquiryStageFromTasks(tx, task.enquiryId!, actorUserId)
  })
}
