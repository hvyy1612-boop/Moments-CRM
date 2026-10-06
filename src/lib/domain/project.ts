import { prisma } from '@/lib/db'
import { systemClock } from '@/lib/time'
import { nextRecordNumber } from './numbering'
import { getJobBalance } from './money'
import { INVOICE_MONEY_SELECT, toInvoiceMoneyInput } from './invoice-money'

/** The interactive-transaction client type, carrying the db.ts extensions. */
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

export async function requireCompany(tx: Tx) {
  const company = await tx.company.findFirst()
  if (!company) throw new Error('No company row exists. Run the seed first.')
  return company
}

/** The Job's human code, J<YYYY><4d> (e.g. J20260001), from the shared per-company/year counter. */
export async function nextProjectCode(tx: Tx, companyId: string, at: Date = systemClock.now()): Promise<string> {
  return nextRecordNumber(tx, companyId, 'JOB', at)
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
      select: { id: true, companyId: true, lifecycleStatus: true },
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
    // value = the accepted quote total, else null.
    const acceptedQuote = await tx.quoteVersion.findFirst({
      where: { quote: { projectId }, status: 'ACCEPTED' },
      orderBy: { acceptedByClientAt: 'desc' },
      select: { total: true },
    })
    const agreed = acceptedQuote?.total ?? null
    const bal = getJobBalance(invoices.map(toInvoiceMoneyInput), agreed)
    // Known agreed value -> canonical isFullySettled (blocks deposit-only / under-invoiced, bug #3).
    // No agreed value (no accepted quote) -> fall back to "nothing outstanding" so a genuinely paid-off
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
