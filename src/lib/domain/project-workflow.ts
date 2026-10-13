import { prisma } from '@/lib/db'
import { cancelOpenWorkItems } from './enquiry-workflow'
import { bookingDetailsFromLead, convertEnquiryCore, createEnquiryTx } from './enquiry'
import { nextProjectCode } from './project'
import { asTaskDue, projectDueData, type TaskDue } from '@/features/tasks/due'
import { formatSydneyDate, daysUntilSydney } from '@/lib/time'
import { getJobBalance } from './money'
import { computeDeposit } from './pricing'
import { INVOICE_MONEY_SELECT, toInvoiceMoneyInput } from './invoice-money'
import { jobShootDate, resolveTaskDueDate, type DeadlineContext } from './deadline'
import {
  buildProjectBoard,
  DEFAULT_PROJECT_TASKS,
  OPTIONAL_STAGE_TASKS,
  PROJECT_STAGE_KEYS,
  PROJECT_STAGES,
  PROJECT_TASK_SCHEDULE,
  stageLabel,
  type ProjectBoard,
  type TaskInput,
} from '@/features/projects/workflow'

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

const SEED_ACTION = 'project.workflow_seeded'

async function seedIfNeeded(tx: Tx, projectId: string, companyId: string) {
  const seeded = await tx.auditLog.count({
    where: { entityType: 'Project', entityId: projectId, action: SEED_ACTION },
  })
  if (seeded > 0) return

  const job = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { shootDate: true, shootStartTime: true } })
  const shootAt =
    job.shootDate && job.shootStartTime
      ? projectDueData({ kind: 'absolute', date: job.shootDate.toISOString().slice(0, 10), time: job.shootStartTime }).dueOverrideAt
      : null
  await tx.workItem.createMany({
    data: DEFAULT_PROJECT_TASKS.map((t, i) => ({
      companyId,
      projectId,
      kind: t.key, // stable core-task key (custom tasks use 'CUSTOM')
      stage: t.stage,
      type: t.type,
      title: t.title,
      status: 'PENDING' as const,
      order: i,

      dueAnchor: 'SHOOT' as const,
      dueOffsetDays: PROJECT_TASK_SCHEDULE[t.title] ?? 0,
      dueOverrideAt: t.type === 'SHOOT' ? shootAt : null,
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

export async function setJobComplete(projectId: string, done: boolean, actorUserId: string | null) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({ where: { id: projectId }, select: { companyId: true, lifecycleStatus: true } })
    if (!project) throw new Error('Job not found.')
    if (done) {
      if (project.lifecycleStatus === 'COMPLETED') return
      if (project.lifecycleStatus !== 'CONFIRMED') throw new Error('Only an active job can be marked complete.')
    } else {
      if (project.lifecycleStatus === 'CONFIRMED') return
      if (project.lifecycleStatus !== 'COMPLETED') throw new Error('Only a completed job can go back to Active.')
    }
    await tx.project.update({ where: { id: projectId }, data: { lifecycleStatus: done ? 'COMPLETED' : 'CONFIRMED' } })
    await tx.auditLog.create({
      data: {
        companyId: project.companyId,
        actorUserId,
        action: done ? 'project.completed_manual' : 'project.reopened',
        entityType: 'Project',
        entityId: projectId,
        afterData: { lifecycleStatus: done ? 'COMPLETED' : 'CONFIRMED' },
      },
    })
  })
}

export const BOOKING_DEPOSIT_PERCENT = 20

export async function bookingDepositReached(tx: Tx, projectId: string): Promise<boolean | null> {
  const accepted = await tx.quoteVersion.findFirst({
    where: { quote: { projectId }, status: 'ACCEPTED' },
    orderBy: { acceptedByClientAt: 'desc' },
    select: { total: true },
  })
  if (!accepted) return null
  const invoices = await tx.invoice.findMany({ where: { projectId }, select: INVOICE_MONEY_SELECT })
  const received = getJobBalance(invoices.map(toInvoiceMoneyInput), accepted.total).paidNet
  return received.greaterThanOrEqualTo(computeDeposit(accepted.total, BOOKING_DEPOSIT_PERCENT).deposit)
}

export async function acceptLeadAsJob(enquiryId: string, actorUserId: string | null) {
  const now = new Date()
  return prisma.$transaction(async (tx) => {
    const lead = await tx.enquiry.findUnique({ where: { id: enquiryId }, select: { status: true, companyId: true } })
    if (!lead) throw new Error('Lead not found.')
    if (lead.status === 'DECLINED') throw new Error('Restore this lead before marking it as a job.')
    if (lead.status === 'BOOKING_CONFIRMED') throw new Error('This lead is already a job.')
    const { projectId } = await convertEnquiryCore(tx, enquiryId, actorUserId, now)
    if (!projectId) throw new Error('The job could not be created.')
    await confirmBookingByDepositTx(tx, projectId, actorUserId)
    await tx.auditLog.create({
      data: { companyId: lead.companyId, actorUserId, action: 'enquiry.job_accepted', entityType: 'Enquiry', entityId: enquiryId, afterData: { projectId } },
    })
    return { projectId }
  })
}

export async function confirmDirectBooking(projectId: string, actorUserId: string | null) {
  await prisma.$transaction((tx) => confirmBookingByDepositTx(tx, projectId, actorUserId))
}

export type DirectJobInput = {
  clientId: string
  name: string
  eventType: string | null
  coverage: string | null
  coverageNote: string | null
  heardAbout: string | null
  shootDate: Date | null
  shootEndDate: Date | null
  shootStartTime: string | null
  shootEndTime: string | null
  shootLocation: string | null
  note: string | null
}

export async function createDirectJob(input: DirectJobInput, actorUserId: string | null) {
  return prisma.$transaction(async (tx) => {
    const client = await tx.client.findUnique({ where: { id: input.clientId }, select: { id: true, companyId: true, archivedAt: true } })
    if (!client || client.archivedAt) throw new Error('That client is no longer available.')
    const now = new Date()
    const project = await tx.project.create({
      data: {
        companyId: client.companyId,
        clientId: client.id,
        code: await nextProjectCode(tx, client.companyId, now),
        name: input.name,
        lifecycleStatus: 'CONFIRMED',
        commercialStatus: 'UNQUOTED',
        source: 'MANUAL',
        ownerUserId: actorUserId,

        confirmedByClientAt: now,
        enquiryReceivedAt: now,
        eventType: input.eventType,
        coverage: input.coverage,
        coverageNote: input.coverageNote,
        heardAbout: input.heardAbout,
        shootDate: input.shootDate,
        shootEndDate: input.shootEndDate,
        shootStartTime: input.shootStartTime,
        shootEndTime: input.shootEndTime,
        shootLocation: input.shootLocation,
      },
    })
    if (input.note) {
      await tx.communication.create({
        data: { projectId: project.id, type: 'NOTE', direction: 'internal', internal: true, body: input.note, byUserId: actorUserId },
      })
    }
    await tx.auditLog.create({
      data: { companyId: client.companyId, actorUserId, action: 'project.created_direct', entityType: 'Project', entityId: project.id, afterData: { code: project.code } },
    })
    await seedIfNeeded(tx, project.id, client.companyId)
    return project
  })
}

export function moveBackToLeadBlocker(job: { lifecycleStatus: string; paidNet: { greaterThan(n: number): boolean } }): string | null {
  if (job.lifecycleStatus !== 'CONFIRMED') return 'Only an active job can go back to being a lead.'

  if (job.paidNet.greaterThan(0)) return 'A payment is recorded on this job, so it stays a job. Refund the payment first to move it back to Leads.'
  return null
}

export async function moveJobBackToLead(projectId: string, actorUserId: string | null) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE`
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: {
        companyId: true, lifecycleStatus: true, name: true, ownerUserId: true, invoices: { select: INVOICE_MONEY_SELECT },
        eventType: true, coverage: true, coverageNote: true, heardAbout: true,
        shootDate: true, shootEndDate: true, shootStartTime: true, shootEndTime: true, shootLocation: true,
        client: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, street: true, suburb: true, state: true, postcode: true, country: true, type: true } },
      },
    })
    if (!project) throw new Error('Job not found.')
    const blocker = moveBackToLeadBlocker({
      lifecycleStatus: project.lifecycleStatus,
      paidNet: getJobBalance(project.invoices.map(toInvoiceMoneyInput), null).paidNet,
    })
    if (blocker) throw new Error(blocker)

    await tx.project.update({ where: { id: projectId }, data: { lifecycleStatus: 'BOOKING_REQUESTED', confirmedByClientAt: null } })
    let lead = await tx.enquiry.findFirst({ where: { convertedProjectId: projectId }, select: { id: true } })
    if (lead) {
      await tx.enquiry.update({ where: { id: lead.id }, data: { status: 'AWAITING_BOOKING_CONFIRMATION' } })

      await tx.workItem.updateMany({ where: { enquiryId: lead.id, status: 'CANCELLED' }, data: { status: 'PENDING' } })
    } else {

      const c = project.client
      const created = await createEnquiryTx(
        tx,
        {
          clientId: c.id,
          name: project.name,
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email,
          phone: c.phone,
          street: c.street,
          suburb: c.suburb,
          state: c.state,
          postcode: c.postcode,
          country: c.country,
          isCompany: c.type === 'BUSINESS',
          eventType: project.eventType,
          eventDate: project.shootDate,
          eventEndDate: project.shootEndDate,
          eventStartTime: project.shootStartTime,
          eventEndTime: project.shootEndTime,
          eventLocation: project.shootLocation,
          coverage: project.coverage,
          coverageNote: project.coverageNote,
          heardAbout: project.heardAbout,
          ownerUserId: project.ownerUserId,
          source: 'MANUAL',
        },
        actorUserId,
      )
      await tx.enquiry.update({
        where: { id: created.id },
        data: { status: 'AWAITING_BOOKING_CONFIRMATION', convertedClientId: c.id, convertedProjectId: projectId },
      })
      lead = { id: created.id }
    }
    await tx.auditLog.create({
      data: { companyId: project.companyId, actorUserId, action: 'project.moved_back_to_lead', entityType: 'Project', entityId: projectId, afterData: { enquiryId: lead.id } },
    })
    await tx.auditLog.create({
      data: { companyId: project.companyId, actorUserId, action: 'enquiry.moved_back_to_lead', entityType: 'Enquiry', entityId: lead.id, afterData: { projectId } },
    })
    return { enquiryId: lead.id }
  })
}

export async function deleteProjects(
  projectIds: string[],
  actorUserId: string | null,
): Promise<{ deleted: number; skipped: number }> {
  let deleted = 0
  let skipped = 0
  for (const projectId of projectIds) {
    const outcome = await prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: { id: true, companyId: true, name: true, _count: { select: { payments: true } } },
      })
      if (!project) return 'missing'

      if (project._count.payments > 0) return 'skip'

      const lead = await tx.enquiry.findFirst({ where: { convertedProjectId: projectId }, select: { id: true } })

      await tx.quote.deleteMany({ where: lead ? { OR: [{ projectId }, { enquiryId: lead.id }] } : { projectId } })
      await tx.invoice.deleteMany({ where: { projectId } })
      await tx.contract.deleteMany({ where: { projectId } })
      await tx.project.delete({ where: { id: projectId } })
      if (lead) await tx.enquiry.delete({ where: { id: lead.id } })
      await tx.auditLog.create({
        data: { companyId: project.companyId, actorUserId, action: 'project.deleted', entityType: 'Project', entityId: projectId, beforeData: { name: project.name, leadId: lead?.id ?? null } },
      })
      return 'deleted'
    })
    if (outcome === 'deleted') deleted++
    else if (outcome === 'skip') skipped++
  }
  return { deleted, skipped }
}

export async function confirmBookingByDepositTx(tx: Tx, projectId: string, actorUserId: string | null) {
  const project = await tx.project.findUnique({ where: { id: projectId }, select: { companyId: true, lifecycleStatus: true } })
  if (!project) return
  if (project.lifecycleStatus === 'BOOKING_REQUESTED') {

    const lead = await tx.enquiry.findFirst({ where: { convertedProjectId: projectId } })

    await tx.project.update({
      where: { id: projectId },
      data: { lifecycleStatus: 'CONFIRMED', confirmedByClientAt: new Date(), ...(lead ? bookingDetailsFromLead(lead) : {}) },
    })
  }
  await seedIfNeeded(tx, projectId, project.companyId)
  const enquiry = await tx.enquiry.findFirst({
    where: { convertedProjectId: projectId },
    select: { id: true, status: true, companyId: true },
  })
  if (enquiry && enquiry.status === 'AWAITING_BOOKING_CONFIRMATION') {
    await tx.enquiry.update({ where: { id: enquiry.id }, data: { status: 'BOOKING_CONFIRMED' } })
    await cancelOpenWorkItems(tx, enquiry.id)
    await tx.auditLog.create({
      data: { companyId: enquiry.companyId, actorUserId, action: 'enquiry.booking_confirmed', entityType: 'Enquiry', entityId: enquiry.id, afterData: { projectId } },
    })
  }
}

export async function getProjectBoard(projectId: string): Promise<ProjectBoard> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      companyId: true,
      lifecycleStatus: true,
      confirmedByClientAt: true,
      owner: { select: { name: true } },
      shootDate: true,
    },
  })

  if (project.lifecycleStatus !== 'BOOKING_REQUESTED') {
    await prisma.$transaction((tx) => seedIfNeeded(tx, projectId, project.companyId))
  }

  const items = await prisma.workItem.findMany({

    where: { projectId, status: { not: 'CANCELLED' } },
    orderBy: { order: 'asc' },
    select: {
      id: true,
      title: true,
      status: true,
      stage: true,
      type: true,
      kind: true,
      dueAnchor: true,
      dueOffsetDays: true,
      dueDateFixed: true,
      dueOverrideAt: true,
      order: true,
      completedAt: true,
      completedBy: { select: { name: true } },
    },
  })

  const ctx: DeadlineContext = {
    shootDate: jobShootDate(items, project.shootDate),
    jobConfirmedAt: project.confirmedByClientAt,
  }

  const tasks: TaskInput[] = items.map((w) => ({
    id: w.id,
    title: w.title,
    status: w.status,
    stage: w.stage,
    type: w.type,
    kind: w.kind,
    resolvedDueAt: resolveTaskDueDate(w, ctx),
    dueAnchor: w.dueAnchor,
    order: w.order,
    completedByName: w.completedBy?.name ?? null,
    completedAt: w.completedAt ?? null,
  }))

  const now = new Date()
  const daysUntil = (d: Date) => daysUntilSydney(d, now)
  return buildProjectBoard(tasks, formatSydneyDate, now, daysUntil, project.owner?.name ?? null)
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
        dueAnchor: 'SHOOT' as const,
        dueOffsetDays: PROJECT_TASK_SCHEDULE[t.title] ?? 0,
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

const ADDABLE = new Set(['TODO', 'EXTRA_SHOOT', 'APPOINTMENT'])

export async function addProjectTask(
  projectId: string,
  stage: string,
  title: string,
  type: string,
  due: TaskDue | Date | null,
  actorUserId: string,
) {
  const clean = title.trim()
  if (!clean) throw new Error('A task needs a title.')

  const stageKey = stage.trim()
  if (!stageKey || stageKey.length > 50) throw new Error('Please enter a valid stage.')
  const taskType = ADDABLE.has(type) ? type : 'TODO'
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { companyId: true } })
    const last = await tx.workItem.findFirst({
      where: { projectId, stage: stageKey },
      orderBy: { order: 'desc' },
      select: { order: true },
    })
    await tx.workItem.create({
      data: {
        companyId: project.companyId,
        projectId,
        kind: 'CUSTOM',
        stage: stageKey,
        type: taskType,
        title: clean,
        status: 'PENDING',
        order: (last?.order ?? 0) + 1,

        ...projectDueData(asTaskDue(due)),
      },
    })
    await tx.auditLog.create({
      data: {
        companyId: project.companyId,
        actorUserId,
        action: 'project.task_added',
        entityType: 'Project',
        entityId: projectId,
        afterData: { stage: stageLabel(stageKey), title: clean },
      },
    })
  })
}

export async function addProjectStage(projectId: string, stageName: string, actorUserId: string) {
  const key = stageName.trim()
  if (!key || key.length > 50) throw new Error('Please enter a stage name.')
  if (PROJECT_STAGE_KEYS.has(key)) throw new Error('That stage already exists.')
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { companyId: true } })
    if (await tx.workItem.count({ where: { projectId, stage: key } })) throw new Error('A stage with that name already exists.')

    const last = await tx.workItem.aggregate({ where: { projectId, stage: { not: null }, kind: { not: 'OVERDUE_FOLLOWUP' } }, _max: { order: true } })
    await tx.workItem.create({
      data: { companyId: project.companyId, projectId, kind: 'CUSTOM', stage: key, type: 'TODO', title: 'New task', status: 'PENDING', order: (last._max.order ?? 0) + 1, dueOverrideAt: null },
    })
    await tx.auditLog.create({
      data: { companyId: project.companyId, actorUserId, action: 'project.stage_added', entityType: 'Project', entityId: projectId, afterData: { stage: key } },
    })
  })
}

export async function renameProjectStage(projectId: string, fromStage: string, toStage: string, actorUserId: string) {
  const to = toStage.trim()
  if (!to || to.length > 50) throw new Error('Please enter a stage name.')
  if (PROJECT_STAGE_KEYS.has(fromStage) || PROJECT_STAGE_KEYS.has(to)) throw new Error('The core stages cannot be renamed.')
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { companyId: true } })
    if (to !== fromStage && (await tx.workItem.count({ where: { projectId, stage: to } }))) throw new Error('A stage with that name already exists.')
    const res = await tx.workItem.updateMany({ where: { projectId, stage: fromStage }, data: { stage: to } })
    if (res.count > 0) {
      await tx.auditLog.create({
        data: { companyId: project.companyId, actorUserId, action: 'project.stage_renamed', entityType: 'Project', entityId: projectId, afterData: { from: fromStage, to } },
      })
    }
  })
}

export async function deleteProjectStage(projectId: string, stage: string, actorUserId: string) {
  if (PROJECT_STAGE_KEYS.has(stage)) throw new Error('The core stages cannot be deleted.')
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { companyId: true } })
    const res = await tx.workItem.deleteMany({ where: { projectId, stage } })
    if (res.count > 0) {
      await tx.auditLog.create({
        data: { companyId: project.companyId, actorUserId, action: 'project.stage_deleted', entityType: 'Project', entityId: projectId, afterData: { stage } },
      })
    }
  })
}

export async function updateProjectTask(taskId: string, title: string, due: TaskDue | Date | null, actorUserId: string | null) {
  const clean = title.trim()
  if (!clean) throw new Error('A task needs a title.')
  const task = await loadTask(taskId)
  await prisma.$transaction(async (tx) => {

    const dueData = due === null ? { dueOverrideAt: null } : projectDueData(asTaskDue(due))
    await tx.workItem.update({ where: { id: taskId }, data: { title: clean, ...dueData } })
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

  const stageRank = new Map(PROJECT_STAGES.map((s, i) => [s.key, i]))
  const optionalStages = new Set(PROJECT_STAGES.filter((s) => s.optional).map((s) => s.key))
  const rankOf = (t: { stage: string | null; order: number }) =>
    (stageRank.get(t.stage ?? '') ?? 999) * 100_000 + t.order
  const target = rankOf(task)
  const targetStage = task.stage ?? ''

  await prisma.$transaction(async (tx) => {
    if (completing) {
      const pending = await tx.workItem.findMany({
        where: { projectId: task.projectId!, status: 'PENDING', type: { not: 'AUTO' } },
        select: { id: true, stage: true, order: true },
      })

      const targetIsCore = stageRank.has(targetStage) && !optionalStages.has(targetStage)
      const ids = pending
        .filter((t) => rankOf(t) <= target)
        .filter((t) => (targetIsCore ? !optionalStages.has(t.stage ?? '') && stageRank.has(t.stage ?? '') : false) || (t.stage ?? '') === targetStage)
        .map((t) => t.id)
      await tx.workItem.updateMany({
        where: { id: { in: ids } },
        data: { status: 'COMPLETED', completedByUserId: actorUserId, completedAt: new Date() },
      })
      await tx.auditLog.create({
        data: {
          companyId: task.companyId,
          actorUserId,
          action: 'project.task_completed',
          entityType: 'Project',
          entityId: task.projectId!,
          afterData: { title: task.title, completedCount: ids.length },
        },
      })

      await maybeAutoCompleteJob(tx, task.projectId!, actorUserId)
    } else {
      await tx.workItem.update({
        where: { id: taskId },
        data: { status: 'PENDING', completedByUserId: null, completedAt: null },
      })
      await tx.auditLog.create({
        data: {
          companyId: task.companyId,
          actorUserId,
          action: 'project.task_reopened',
          entityType: 'Project',
          entityId: task.projectId!,
          afterData: { title: task.title },
        },
      })
    }
  })
}

const AUTO_COMPLETE_FROM = new Set(['CONFIRMED'])

export async function maybeAutoCompleteJob(tx: Tx, projectId: string, actorUserId: string | null) {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: { companyId: true, lifecycleStatus: true },
  })
  if (!project || !AUTO_COMPLETE_FROM.has(project.lifecycleStatus)) return

  const [total, pending] = await Promise.all([
    tx.workItem.count({ where: { projectId, type: { not: 'AUTO' }, status: { not: 'CANCELLED' } } }),
    tx.workItem.count({ where: { projectId, type: { not: 'AUTO' }, status: 'PENDING' } }),
  ])
  if (total === 0 || pending > 0) return

  await tx.project.update({ where: { id: projectId }, data: { lifecycleStatus: 'COMPLETED' } })
  await tx.auditLog.create({
    data: {
      companyId: project.companyId,
      actorUserId: actorUserId ?? undefined,
      action: 'project.auto_completed',
      entityType: 'Project',
      entityId: projectId,
      afterData: { lifecycleStatus: 'COMPLETED' },
    },
  })
}
