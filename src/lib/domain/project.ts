import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { systemClock } from '@/lib/time'
import { nextRecordNumber } from './numbering'
import { getJobBalance } from './money'
import { INVOICE_MONEY_SELECT, toInvoiceMoneyInput } from './invoice-money'

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

export const JOB_WHERE: Prisma.ProjectWhereInput = {
  OR: [
    { lifecycleStatus: { in: ['CONFIRMED', 'COMPLETED', 'CLOSED'] } },
    { lifecycleStatus: 'CANCELLED', confirmedByClientAt: { not: null } },
  ],
}

export async function requireCompany(tx: Tx) {
  const company = await tx.company.findFirst()
  if (!company) throw new Error('No company row exists. Run the seed first.')
  return company
}

export async function nextProjectCode(tx: Tx, companyId: string, at: Date = systemClock.now()): Promise<string> {
  return nextRecordNumber(tx, companyId, 'JOB', at)
}

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

    const invoices = await tx.invoice.findMany({
      where: { projectId, status: { not: 'VOID' } },
      select: INVOICE_MONEY_SELECT,
    })

    const acceptedQuote = await tx.quoteVersion.findFirst({
      where: { quote: { projectId }, status: 'ACCEPTED' },
      orderBy: { acceptedByClientAt: 'desc' },
      select: { total: true },
    })
    const agreed = acceptedQuote?.total ?? null
    const bal = getJobBalance(invoices.map(toInvoiceMoneyInput), agreed)

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
    return { alreadyClosed: false }
  })
}
