import { prisma } from '@/lib/db'
import { cancelOpenWorkItems } from './enquiry-workflow'
import { asTaskDue, projectDueData, type TaskDue } from '@/features/tasks/due'
import { formatSydneyDate, daysUntilSydney } from '@/lib/time'
import { getJobBalance } from './money'
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
  type ProjectFacts,
  type TaskInput,
} from '@/features/projects/workflow'

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

const SEED_ACTION = 'project.workflow_seeded'

/** Seed the default suggested flow exactly once per project (guarded by a seed audit row), so deleting
 *  every task later does not make it re-appear. Optional stages are not seeded. */
async function seedIfNeeded(tx: Tx, projectId: string, companyId: string) {
  const seeded = await tx.auditLog.count({
    where: { entityType: 'Project', entityId: projectId, action: SEED_ACTION },
  })
  if (seeded > 0) return
  // The main shoot keeps the date AND time staff entered on the lead (Add job / Add lead "Main shoot"): it
  // becomes the Shoot task's set time, so the job, the Jobs list and the calendar show the shoot in its slot.
  // A lead with a date but no time (or "All day") leaves the task on the lead's day, as before.
  const lead = await tx.enquiry.findFirst({
    where: { convertedProjectId: projectId },
    orderBy: { createdAt: 'desc' },
    select: { eventDate: true, eventStartTime: true },
  })
  const shootAt =
    lead?.eventDate && lead.eventStartTime
      ? projectDueData({ kind: 'absolute', date: lead.eventDate.toISOString().slice(0, 10), time: lead.eventStartTime }).dueOverrideAt
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
      // Deadline foundation (docs/25 Part 2): every default task is shoot-anchored; the offset is
      // stored on the row (from PROJECT_TASK_SCHEDULE) so a rename never breaks the schedule.
      dueAnchor: 'SHOOT' as const,
      dueOffsetDays: PROJECT_TASK_SCHEDULE[t.title] ?? 0,
      dueOverrideAt: t.type === 'SHOOT' ? shootAt : null,
    })),
  })
  await tx.auditLog.create({
    data: { companyId, action: SEED_ACTION, entityType: 'Project', entityId: projectId },
  })
}

/** Seed the workflow for a project up front (e.g. right after a booking is confirmed), so the projects
 *  list shows its next task without waiting for the detail page to be opened. Idempotent. */
export async function seedProjectWorkflow(projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { companyId: true } })
  await prisma.$transaction((tx) => seedIfNeeded(tx, projectId, project.companyId))
}

/** Add job: a booking the client already confirmed outside the app (Studio Ninja "create a job directly").
 *  Confirms the new job at once; no payment or contract is recorded for it. */
export async function confirmDirectBooking(projectId: string, actorUserId: string | null) {
  await prisma.$transaction((tx) => confirmBookingByDepositTx(tx, projectId, actorUserId))
}

/** Why a job cannot go back to being a lead right now, or null when it can (see moveJobBackToLead). */
export function moveBackToLeadBlocker(job: { lifecycleStatus: string; hasLead: boolean; paidNet: { greaterThan(n: number): boolean } }): string | null {
  if (!job.hasLead) return 'This job has no lead to go back to.'
  if (job.lifecycleStatus !== 'CONFIRMED') return 'Only an active job can go back to being a lead.'
  // The deposit holds the date: money received means it IS a booking, so it cannot be "unaccepted".
  if (job.paidNet.greaterThan(0)) return 'A payment is recorded on this job, so it stays a job. Refund the payment first to move it back to Leads.'
  return null
}

/**
 * Untick "Job accepted" (Studio Ninja): the job becomes a lead again - it leaves Jobs and its lead goes back
 * to "Awaiting booking confirmation" with its checklist reopened. For a booking confirmed by mistake (e.g.
 * Add job too early). Refused once any money is recorded (the deposit holds the date) and for delivered or
 * closed jobs. The production tasks are kept and come back if it is confirmed again.
 */
export async function moveJobBackToLead(projectId: string, actorUserId: string | null) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE`
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { companyId: true, lifecycleStatus: true, invoices: { select: INVOICE_MONEY_SELECT } },
    })
    if (!project) throw new Error('Job not found.')
    const lead = await tx.enquiry.findFirst({ where: { convertedProjectId: projectId }, select: { id: true, status: true } })
    const blocker = moveBackToLeadBlocker({
      lifecycleStatus: project.lifecycleStatus,
      hasLead: lead !== null,
      paidNet: getJobBalance(project.invoices.map(toInvoiceMoneyInput), null).paidNet,
    })
    if (blocker || !lead) throw new Error(blocker ?? 'This job has no lead to go back to.')

    // Back to a booking file: not a Job anywhere (JOB_WHERE / isBookingFile) until it is confirmed again.
    await tx.project.update({ where: { id: projectId }, data: { lifecycleStatus: 'BOOKING_REQUESTED', confirmedByClientAt: null } })
    await tx.enquiry.update({ where: { id: lead.id }, data: { status: 'AWAITING_BOOKING_CONFIRMATION' } })
    // The lead tasks closed out on confirmation become workable again (same as Reopen).
    await tx.workItem.updateMany({ where: { enquiryId: lead.id, status: 'CANCELLED' }, data: { status: 'PENDING' } })
    await tx.auditLog.create({
      data: { companyId: project.companyId, actorUserId, action: 'project.moved_back_to_lead', entityType: 'Project', entityId: projectId, afterData: { enquiryId: lead.id } },
    })
    await tx.auditLog.create({
      data: { companyId: project.companyId, actorUserId, action: 'enquiry.moved_back_to_lead', entityType: 'Enquiry', entityId: lead.id, afterData: { projectId } },
    })
    return { enquiryId: lead.id }
  })
}

/**
 * Confirm a booking: the moment a lead becomes a JOB. Called when the deposit is paid (from the finance
 * payment handler, inside the SAME transaction) and by Add job for a booking the client already confirmed
 * outside the app. A signed contract alone never calls this - the studio's policy is that the deposit holds
 * the date. Turns the booking file into a Job (BOOKING_REQUESTED -> CONFIRMED + seeds the production
 * workflow) and flips the linked lead AWAITING_BOOKING_CONFIRMATION -> BOOKING_CONFIRMED, closing out its
 * unticked lead tasks (the lead section is then read-only, Studio-Ninja style). Fully idempotent: the
 * lifecycle only advances from BOOKING_REQUESTED, the seed is guarded, and the lead only flips from
 * AWAITING - so replaying the payment event is a no-op.
 */
export async function confirmBookingByDepositTx(tx: Tx, projectId: string, actorUserId: string | null) {
  const project = await tx.project.findUnique({ where: { id: projectId }, select: { companyId: true, lifecycleStatus: true } })
  if (!project) return
  if (project.lifecycleStatus === 'BOOKING_REQUESTED') {
    // The confirmation date anchors every JOB_CONFIRMED task (e.g. "within 3 days of booking").
    await tx.project.update({ where: { id: projectId }, data: { lifecycleStatus: 'CONFIRMED', confirmedByClientAt: new Date() } })
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

/** Read the project's business facts + editable task rows and build the board. Seeds once on first read. */
export async function getProjectBoard(projectId: string): Promise<ProjectBoard> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      companyId: true,
      lifecycleStatus: true,
      confirmedByClientAt: true,
      owner: { select: { name: true } },
      invoices: { select: INVOICE_MONEY_SELECT },
      convertedFromEnquiries: { select: { eventDate: true }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  })

  // A booking file (deposit not paid yet) has no production checklist: it is seeded when it is confirmed.
  if (project.lifecycleStatus !== 'BOOKING_REQUESTED') {
    await prisma.$transaction((tx) => seedIfNeeded(tx, projectId, project.companyId))
  }

  const items = await prisma.workItem.findMany({
    // A CANCELLED row (e.g. an overdue-payment follow-up the cron resolved once the invoice was paid) is
    // no longer work: it never shows as Pending or counts toward progress.
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

  // One deadline resolver for the whole board (Rule D0): SHOOT tasks follow the job's shoot date (set on
  // the Shoot task, else the lead's event date), JOB_CONFIRMED tasks the booking confirmation date.
  const ctx: DeadlineContext = {
    shootDate: jobShootDate(items, project.convertedFromEnquiries[0]?.eventDate),
    jobConfirmedAt: project.confirmedByClientAt,
  }

  // "Final payment received" via the Money foundation (docs/25), the same settlement rule as auto-complete:
  // with an accepted quote (the agreed value) the WHOLE agreed amount must be invoiced and paid - a paid
  // deposit alone is not the final payment. With no accepted quote: a real obligation exists and nothing
  // is owed on it.
  const acceptedQuote = await prisma.quoteVersion.findFirst({
    where: { quote: { projectId }, status: 'ACCEPTED' },
    orderBy: { acceptedByClientAt: 'desc' },
    select: { total: true },
  })
  const jobMoney = getJobBalance(project.invoices.map(toInvoiceMoneyInput), acceptedQuote?.total ?? null)
  const facts: ProjectFacts = {
    // The read-only system milestone (derived from real records, never staff-ticked):
    finalPaid: jobMoney.agreedValueKnown
      ? jobMoney.isFullySettled
      : jobMoney.invoicedObligation.greaterThan(0) && jobMoney.outstanding.lessThanOrEqualTo(0),
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
  return buildProjectBoard(facts, tasks, formatSydneyDate, now, daysUntil, project.owner?.name ?? null)
}

async function loadTask(taskId: string) {
  const task = await prisma.workItem.findUnique({
    where: { id: taskId },
    select: { id: true, projectId: true, companyId: true, stage: true, order: true, status: true, title: true, type: true },
  })
  if (!task || !task.projectId) throw new Error('Task not found.')
  return task
}

/** Insert the default task block for an optional stage (Pre-wedding / Video / Film / Album), once. */
export async function addProjectStageBlock(projectId: string, stage: string, actorUserId: string) {
  const def = PROJECT_STAGES.find((s) => s.key === stage)
  const block = OPTIONAL_STAGE_TASKS[stage]
  if (!def || !def.optional || !block) throw new Error('Not an optional stage.')
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { companyId: true } })
    const existing = await tx.workItem.count({ where: { projectId, stage } })
    if (existing > 0) return // already has tasks; do not duplicate
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

// What staff can add to a job (features/enquiries JOB_TASK_TYPES). Never SHOOT: that is the job's one main
// shoot task, whose date is the shoot date - another shoot is an EXTRA_SHOOT and leaves it alone.
const ADDABLE = new Set(['TODO', 'EXTRA_SHOOT', 'APPOINTMENT'])

/** Add a task to a stage of a project's workflow. */
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
  // A core stage key, or a per-project custom stage (a free group name, e.g. "Second shooter").
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
        // No due date / relative to the shoot or job accepted / a set day / a set date + time (Rule D1:
        // a timed date is an override). See features/tasks/due.
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

/**
 * Per-project custom stages (extra workflow groups beyond the fixed production stages). A stage exists
 * while it has a task, so "add" seeds a starter task, "rename" re-keys the group, "delete" removes it.
 * The core production stages drive the job's phase/progress and are never touched here.
 */
export async function addProjectStage(projectId: string, stageName: string, actorUserId: string) {
  const key = stageName.trim()
  if (!key || key.length > 50) throw new Error('Please enter a stage name.')
  if (PROJECT_STAGE_KEYS.has(key)) throw new Error('That stage already exists.')
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { companyId: true } })
    if (await tx.workItem.count({ where: { projectId, stage: key } })) throw new Error('A stage with that name already exists.')
    // Placed after every existing task (follow-up rows aside), so a new stage lists after those already there.
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

/** Rename a task and/or set its manual due date. A manual date is an override (Rule D1); passing null
 *  clears the override so the task follows its anchor again. */
export async function updateProjectTask(taskId: string, title: string, due: TaskDue | Date | null, actorUserId: string | null) {
  const clean = title.trim()
  if (!clean) throw new Error('A task needs a title.')
  const task = await loadTask(taskId)
  await prisma.$transaction(async (tx) => {
    // `null` (older callers) clears only the manual date, falling back to the task's anchor (Rule D1).
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

/**
 * Toggle a task. Completing a task ALSO completes every earlier staff task (a "done up to here"
 * cascade): the workflow is a sequence, so ticking a step means everything before it is done and the
 * next-task pointer jumps past it. Ordering is stage (PROJECT_STAGES) then per-stage `order`. AUTO rows
 * are skipped in both directions - their done-state is read from real records, not staff-toggled.
 * Re-opening is per-task only, so staff can still correct any single step by hand.
 */
export async function toggleProjectTask(taskId: string, actorUserId: string) {
  const task = await loadTask(taskId)
  if (task.type === 'AUTO') return // auto rows are system-driven, not staff-toggled
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
      // Cascade reconciles only legitimate predecessors: earlier tasks in mandatory stages or the SAME
      // stage. It never sweeps a DIFFERENT optional stage (Pre-shoot / Video / Film / Album) - ticking a
      // Delivery task must not silently complete unfinished optional add-on work (bug #4).
      // Optional add-on stages (Video / Film / Album) and staff custom stages run ALONGSIDE production, not
      // after it: ticking a task there only reconciles earlier tasks of that same stage, never the core
      // Pre-shoot..Delivery checklist (bug-scan 2026-10-05: one video tick completed the whole job).
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
      // Finishing the checklist is one half of "done"; auto-complete the job if the balance is settled too.
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

// Only a confirmed Job can finish; a booking file (deposit not paid) never auto-completes.
const AUTO_COMPLETE_FROM = new Set(['CONFIRMED'])

/**
 * Auto-complete a job when it is truly finished: EVERY staff task done AND the balance fully settled.
 * Called from whichever event completes last - the final task tick (see toggleProjectTask) or the final
 * payment (see recordPayment) - so staff never flip the status by hand and a delivered-but-unpaid job
 * stays visible until it is paid. Forward-only from an active job state; parked/terminal states are left
 * alone. Re-opening a task never auto-demotes (that stays a manual correction). No-op unless both hold.
 */
export async function maybeAutoCompleteJob(tx: Tx, projectId: string, actorUserId: string | null) {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: { companyId: true, lifecycleStatus: true, invoices: { select: INVOICE_MONEY_SELECT } },
  })
  if (!project || !AUTO_COMPLETE_FROM.has(project.lifecycleStatus)) return

  const [total, pending] = await Promise.all([
    tx.workItem.count({ where: { projectId, type: { not: 'AUTO' }, status: { not: 'CANCELLED' } } }),
    tx.workItem.count({ where: { projectId, type: { not: 'AUTO' }, status: 'PENDING' } }),
  ])
  if (total === 0 || pending > 0) return // checklist not finished

  // "Settled" is the canonical isFullySettled (money.ts / docs/25 Rule M4b), NOT raw outstanding: a job
  // with no invoice (outstanding 0) or only a deposit paid must NOT auto-complete (bug #3). Agreed value
  // = the accepted quote total, else null (unknown).
  const acceptedQuote = await tx.quoteVersion.findFirst({
    where: { quote: { projectId }, status: 'ACCEPTED' },
    orderBy: { acceptedByClientAt: 'desc' },
    select: { total: true },
  })
  const agreed = acceptedQuote?.total ?? null
  const bal = getJobBalance(project.invoices.map(toInvoiceMoneyInput), agreed)
  // With a KNOWN agreed value use the canonical isFullySettled (catches deposit-only / under-invoiced,
  // bug #3). Without one (a job with no accepted quote) fall back to "nothing outstanding" so the
  // no-quote flow still completes - never demand an agreed value the studio never set (regression guard).
  const settled = bal.agreedValueKnown
    ? bal.isFullySettled
    : bal.outstanding.lessThanOrEqualTo(0) && bal.overpaymentToResolve.lessThanOrEqualTo(0)
  if (!settled) return // still owed / under-invoiced - stay active so nothing is forgotten

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
