import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createEnquiry, convertEnquiry } from '@/lib/domain/enquiry'
import { closeJob } from '@/lib/domain/project'

const email = () => `it-${randomUUID()}@moments.test`

beforeAll(async () => {
  const company = await prisma.company.findFirst()
  if (!company) await prisma.company.create({ data: { name: 'Integration Studio' } })
})

/** A converted job forced to the delivered (COMPLETED) state, ready for closing. */
async function deliveredJob(): Promise<string> {
  const conv = await convertEnquiry((await createEnquiry({ name: 'Closer', email: email() })).id)
  const projectId = conv.projectId!
  await prisma.project.update({ where: { id: projectId }, data: { lifecycleStatus: 'COMPLETED' } })
  return projectId
}

describe('closeJob (integration, real DB) - DELIVERED != CLOSED', () => {
  it('closes a delivered job that is settled and has no blocking tasks; idempotent', async () => {
    const projectId = await deliveredJob()
    await prisma.workItem.updateMany({
      where: { projectId, type: { not: 'AUTO' } },
      data: { status: 'COMPLETED' },
    })

    const r = await closeJob(projectId)
    expect(r.alreadyClosed).toBe(false)
    expect((await prisma.project.findUnique({ where: { id: projectId } }))?.lifecycleStatus).toBe('CLOSED')

    const r2 = await closeJob(projectId)
    expect(r2.alreadyClosed).toBe(true)
  })

  it('refuses to close while a balance is outstanding', async () => {
    const projectId = await deliveredJob()
    await prisma.workItem.updateMany({
      where: { projectId, type: { not: 'AUTO' } },
      data: { status: 'COMPLETED' },
    })
    await prisma.invoice.create({
      data: {
        projectId,
        invoiceNumber: `INV-${randomUUID().slice(0, 8)}`,
        type: 'BALANCE',
        status: 'ISSUED',
        total: '1000',
        amountPaid: '0',
        billingNameSnapshot: 'Closer',
      },
    })
    await expect(closeJob(projectId)).rejects.toThrow(/outstanding/i)
  })

  it('refuses to close while a blocking task is still pending', async () => {
    const projectId = await deliveredJob()
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { companyId: true } })
    await prisma.workItem.create({
      data: { companyId: project!.companyId, projectId, kind: 'CUSTOM', type: 'TODO', title: 'Finish edit', status: 'PENDING' },
    })
    await expect(closeJob(projectId)).rejects.toThrow(/task/i)
  })

  it('refuses to close a job that has not been delivered', async () => {
    const conv = await convertEnquiry((await createEnquiry({ name: 'Early', email: email() })).id)
    await expect(closeJob(conv.projectId!)).rejects.toThrow(/delivered/i)
  })
})
