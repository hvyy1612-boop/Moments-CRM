import { Prisma, type ProjectLifecycle } from '@prisma/client'
import { prisma } from '@/lib/db'
import { systemClock } from '@/lib/time'
import { getJobBalance } from './money'
import { INVOICE_MONEY_SELECT, toInvoiceMoneyInput } from './invoice-money'
import type { EnquiryInput } from '@/lib/validation/enquiry'

/** The interactive-transaction client type, carrying the db.ts extensions. */
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

export async function requireCompany(tx: Tx) {
  const company = await tx.company.findFirst()
  if (!company) throw new Error('No company row exists. Run the seed first.')
  return company
}

/** Human-readable, per-year sequential project code, e.g. MPF-2026-0001. */
export async function nextProjectCode(tx: Tx, year: number): Promise<string> {
  const prefix = `MPF-${year}-`
  const last = await tx.project.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: 'desc' },
    select: { code: true },
  })
  const next = last ? Number(last.code.slice(prefix.length)) + 1 : 1
  return `${prefix}${String(next).padStart(4, '0')}`
}

/**
 * Create a booked Job directly (a "direct job" for a known booking / staff-added job). The client is
 * deduped by email. The Project starts at BOOKING_REQUESTED - it is a Job from the start, NOT a funnel
 * lead; leads are Enquiry records (docs/24 FIX 6). One transaction, with an audit row + outbox event.
 */
export async function createProjectFromEnquiry(input: EnquiryInput) {
  const now = systemClock.now()
  // The per-year code and the client email are unique; two enquiries landing at once can collide.
  // Retry a few times on a unique violation so concurrency never surfaces as a user error.
  for (let attempt = 0; ; attempt++) {
    try {
      return await runCreateProjectFromEnquiry(input, now)
    } catch (error) {
      const isUnique =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
      if (isUnique && attempt < 4) continue
      throw error
    }
  }
}

async function runCreateProjectFromEnquiry(input: EnquiryInput, now: Date) {
  return prisma.$transaction(async (tx) => {
    const company = await requireCompany(tx)

    let client = await tx.client.findUnique({ where: { email: input.email } })
    if (!client) {
      client = await tx.client.create({
        data: {
          companyId: company.id,
          type: input.isCompany ? 'BUSINESS' : 'INDIVIDUAL',
          displayName: input.name,
          firstName: input.firstName ?? null,
          lastName: input.lastName ?? null,
          email: input.email,
          phone: input.phone ?? null,
          street: input.street ?? null,
          suburb: input.suburb ?? null,
          state: input.state ?? null,
          postcode: input.postcode ?? null,
          country: input.country ?? null,
          status: 'PROSPECT',
        },
      })
    }

    const project = await tx.project.create({
      data: {
        companyId: company.id,
        clientId: client.id,
        code: await nextProjectCode(tx, now.getFullYear()),
        name: input.eventType ?? 'Job',
        lifecycleStatus: 'BOOKING_REQUESTED',
        commercialStatus: 'UNQUOTED',
        source: input.source ?? null,
        enquiryReceivedAt: now,
        enquiryNotes: input.message ?? null,
      },
    })

    await tx.auditLog.create({
      data: {
        companyId: company.id,
        action: 'project.created',
        entityType: 'Project',
        entityId: project.id,
        source: 'public.enquiry',
        afterData: { code: project.code, clientId: client.id },
      },
    })
    await tx.outboxEvent.create({
      data: {
        eventType: 'project.created',
        aggregateType: 'Project',
        aggregateId: project.id,
        payload: { projectId: project.id, clientId: client.id },
      },
    })

    return project
  })
}

/**
 * Manually set a project's lifecycle status from the board (the Monday-style label pick). Records an
 * audit row with the before/after status and a no-op when the status is unchanged. The commercial
 * status is left as-is: this is a presentational stage move, not a billing transition.
 */
export async function setProjectLifecycle(
  projectId: string,
  status: ProjectLifecycle,
  actorUserId: string,
) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { id: true, companyId: true, lifecycleStatus: true },
    })
    if (!project) throw new Error('Project not found.')
    if (project.lifecycleStatus === status) return project

    const updated = await tx.project.update({
      where: { id: projectId },
      data: { lifecycleStatus: status },
      select: { id: true, lifecycleStatus: true },
    })
    await tx.auditLog.create({
      data: {
        companyId: project.companyId,
        actorUserId,
        action: 'project.status_changed',
        entityType: 'Project',
        entityId: projectId,
        source: 'staff.board',
        beforeData: { lifecycleStatus: project.lifecycleStatus },
        afterData: { lifecycleStatus: status },
      },
    })
    return updated
  })
}

/**
 * Close a delivered job: COMPLETED -> CLOSED. Allowed only once the job is delivered, fully settled
 * (no outstanding balance across its non-void invoices) and has no blocking staff tasks left. Guarded
 * and idempotent; records an audit row and an outbox event (docs/24 Increment 2). This is the
 * DELIVERED != CLOSED distinction: a job stays "Delivered" (visible, maybe with a balance) until it is
 * explicitly closed.
 */
export async function closeJob(projectId: string, actorUserId: string | null = null) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { id: true, companyId: true, lifecycleStatus: true, packagePriceSnapshot: true },
    })
    if (!project) throw new Error('Job not found.')
    if (project.lifecycleStatus === 'CLOSED') return { alreadyClosed: true }
    if (project.lifecycleStatus !== 'COMPLETED') {
      throw new Error('Only a delivered job can be closed.')
    }

    // Outstanding via the Money foundation (docs/25): Σ per-invoice `owed`, so a credit note reduces
    // the balance and an overpaid invoice never silently offsets another's shortfall. Agreed value is
    // irrelevant to `outstanding`, so we pass null and read only that field.
    const invoices = await tx.invoice.findMany({
      where: { projectId, status: { not: 'VOID' } },
      select: INVOICE_MONEY_SELECT,
    })
    // Close only a truly settled job: canonical isFullySettled (money.ts / docs/25 Rule M4b), never raw
    // outstanding - so a job with no invoice or a deposit-only invoice cannot be closed (bug #3). Agreed
    // value = the accepted quote total, else the package price snapshot, else null.
    const acceptedQuote = await tx.quoteVersion.findFirst({
      where: { quote: { projectId }, status: 'ACCEPTED' },
      orderBy: { acceptedByClientAt: 'desc' },
      select: { total: true },
    })
    const agreed = acceptedQuote?.total ?? project.packagePriceSnapshot ?? null
    const bal = getJobBalance(invoices.map(toInvoiceMoneyInput), agreed)
    // Known agreed value -> canonical isFullySettled (blocks deposit-only / under-invoiced, bug #3).
    // No agreed value (no quote/package) -> fall back to "nothing outstanding" so a genuinely paid-off
    // or zero-value job can still close (keeps the no-quote flow + its tests working, regression guard).
    const settled = bal.agreedValueKnown
      ? bal.isFullySettled
      : bal.outstanding.lessThanOrEqualTo(0) && bal.overpaymentToResolve.lessThanOrEqualTo(0)
    if (!settled) {
      if (bal.outstanding.greaterThan(0)) throw new Error(`This job still has ${bal.outstanding.toFixed(2)} outstanding.`)
      if (bal.overpaymentToResolve.greaterThan(0)) throw new Error(`This job has ${bal.overpaymentToResolve.toFixed(2)} overpaid to resolve first.`)
      if (bal.uninvoicedRemainder && bal.uninvoicedRemainder.greaterThan(0)) throw new Error(`This job is not fully invoiced yet (${bal.uninvoicedRemainder.toFixed(2)} still to bill).`)
      throw new Error('This job is not fully settled yet.')
    }

    const blocking = await tx.workItem.count({
      where: { projectId, status: 'PENDING', type: { not: 'AUTO' } },
    })
    if (blocking > 0) {
      throw new Error(`This job still has ${blocking} task${blocking === 1 ? '' : 's'} to finish.`)
    }

    await tx.project.update({ where: { id: projectId }, data: { lifecycleStatus: 'CLOSED' } })
    await tx.auditLog.create({
      data: {
        companyId: project.companyId,
        actorUserId,
        action: 'project.closed',
        entityType: 'Project',
        entityId: projectId,
        source: 'staff.board',
      },
    })
    await tx.outboxEvent.create({
      data: {
        eventType: 'project.closed',
        aggregateType: 'Project',
        aggregateId: projectId,
        payload: { projectId },
      },
    })
    return { alreadyClosed: false }
  })
}
