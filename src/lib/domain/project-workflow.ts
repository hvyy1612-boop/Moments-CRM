import { prisma } from '@/lib/db'
import { formatSydneyDate, daysUntilSydney } from '@/lib/time'
import { getJobBalance } from './money'
import { INVOICE_MONEY_SELECT, toInvoiceMoneyInput } from './invoice-money'
import { makeShootDateOf, resolveTaskDueDate, type DeadlineContext } from './deadline'
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

/**
 * Confirm a booking once its deposit is paid (neutral Enquiry model). Called from the finance deposit
 * handler inside the SAME transaction. Activates the provisional Job (BOOKING_REQUESTED -> CONFIRMED +
 * seeds the production workflow) and flips the linked enquiry AWAITING_BOOKING_CONFIRMATION ->
 * BOOKING_CONFIRMED. Fully idempotent: the lifecycle only advances from BOOKING_REQUESTED, the seed is
 * guarded, and the enquiry only flips from AWAITING - so replaying the payment event is a no-op.
 */
export async function confirmBookingByDepositTx(tx: Tx, projectId: string, actorUserId: string | null) {
  const project = await tx.project.findUnique({ where: { id: projectId }, select: { companyId: true, lifecycleStatus: true } })
  if (!project) return
  if (project.lifecycleStatus === 'BOOKING_REQUESTED') {
    await tx.project.update({ where: { id: projectId }, data: { lifecycleStatus: 'CONFIRMED' } })
  }
  await seedIfNeeded(tx, projectId, project.companyId)
  const enquiry = await tx.enquiry.findFirst({
    where: { convertedProjectId: projectId },
    select: { id: true, status: true, companyId: true },
  })
  if (enquiry && enquiry.status === 'AWAITING_BOOKING_CONFIRMATION') {
    await tx.enquiry.update({ where: { id: enquiry.id }, data: { status: 'BOOKING_CONFIRMED' } })
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
      confirmedByClientAt: true,
      owner: { select: { name: true } },
      invoices: { select: INVOICE_MONEY_SELECT },
      galleries: { select: { status: true } },
      bookings: { select: { id: true, startsAt: true, status: true, rescheduledFromId: true } },
    },
  })

  await prisma.$transaction((tx) => seedIfNeeded(tx, projectId, project.companyId))

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
      bookingId: true,
      order: true,
      completedAt: true,
      completedBy: { select: { name: true } },
    },
  })

  // One deadline resolver for the whole board (Rule D0): shoot dates come from the job's bookings
  // (a linked task follows its own shoot; an unlinked one follows the primary shoot), JOB_CONFIRMED
  // from the confirm date.
  const ctx: DeadlineContext = {
    shootDateOf: makeShootDateOf(project.bookings),
    jobConfirmedAt: project.confirmedByClientAt,
  }

  // "Paid in full" via the Money foundation (docs/25): there is a real obligation (excludes DRAFT/VOID
  // and credit notes) and nothing is owed on it. Agreed value is irrelevant here, so pass null.
  const jobMoney = getJobBalance(project.invoices.map(toInvoiceMoneyInput), null)
  const gallerySent = project.galleries.some((g) => g.status === 'PUBLISHED')
  const finalPaid = jobMoney.invoicedObligation.greaterThan(0) && jobMoney.outstanding.lessThanOrEqualTo(0)
  const facts: ProjectFacts = {
    // Read-only system milestones (derived from real records, never staff-ticked):
    shootScheduled: project.bookings.some((b) => b.status !== 'CANCELLED' && b.startsAt != null),
    gallerySent,
    finalPaid,
    deliveryComplete: gallerySent && finalPaid,
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

const ADDABLE = new Set(['TODO', 'AUTO_EMAIL', 'APPOINTMENT', 'SHOOT'])

/** Add a task to a stage of a project's workflow. */
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
        // A staff-added task is manually dated (or undated): the date is an override, not an anchor.
        dueOverrideAt: dueAt,
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
    await tx.workItem.create({
      data: { companyId: project.companyId, projectId, kind: 'CUSTOM', stage: key, type: 'TODO', title: 'New task', status: 'PENDING', order: 1, dueOverrideAt: null },
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
export async function updateProjectTask(taskId: string, title: string, dueAt: Date | null, actorUserId: string | null) {
  const clean = title.trim()
  if (!clean) throw new Error('A task needs a title.')
  const task = await loadTask(taskId)
  await prisma.$transaction(async (tx) => {
    await tx.workItem.update({ where: { id: taskId }, data: { title: clean, dueOverrideAt: dueAt } })
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

const AUTO_COMPLETE_FROM = new Set(['BOOKING_REQUESTED', 'CONFIRMED', 'IN_PRODUCTION'])

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
    select: { companyId: true, lifecycleStatus: true, packagePriceSnapshot: true, invoices: { select: INVOICE_MONEY_SELECT } },
  })
  if (!project || !AUTO_COMPLETE_FROM.has(project.lifecycleStatus)) return

  const [total, pending] = await Promise.all([
    tx.workItem.count({ where: { projectId, type: { not: 'AUTO' }, status: { not: 'CANCELLED' } } }),
    tx.workItem.count({ where: { projectId, type: { not: 'AUTO' }, status: 'PENDING' } }),
  ])
  if (total === 0 || pending > 0) return // checklist not finished

  // "Settled" is the canonical isFullySettled (money.ts / docs/25 Rule M4b), NOT raw outstanding: a job
  // with no invoice (outstanding 0) or only a deposit paid must NOT auto-complete (bug #3). Agreed value
  // = the accepted quote total, else the direct booking's package price snapshot, else null (unknown).
  const acceptedQuote = await tx.quoteVersion.findFirst({
    where: { quote: { projectId }, status: 'ACCEPTED' },
    orderBy: { acceptedByClientAt: 'desc' },
    select: { total: true },
  })
  const agreed = acceptedQuote?.total ?? project.packagePriceSnapshot ?? null
  const bal = getJobBalance(project.invoices.map(toInvoiceMoneyInput), agreed)
  // With a KNOWN agreed value use the canonical isFullySettled (catches deposit-only / under-invoiced,
  // bug #3). Without one (a direct job with no quote/package) fall back to "nothing outstanding" so the
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
