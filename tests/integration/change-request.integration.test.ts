import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createEnquiry, convertEnquiry } from '@/lib/domain/enquiry'
import { createQuote, saveQuoteDraft } from '@/lib/domain/quote'
import { getProjectBoard, seedProjectWorkflow } from '@/lib/domain/project-workflow'
import {
  applyChangeRequest,
  approveChangeRequest,
  assessChangeRequest,
  createChangeRequest,
  recordClientAgreement,
  rejectChangeRequest,
} from '@/lib/domain/change-request'

const email = () => `cr-${randomUUID()}@moments.test`

async function confirmedJob(lifecycle: 'CONFIRMED' | 'COMPLETED' = 'CONFIRMED'): Promise<string> {
  const conv = await convertEnquiry((await createEnquiry({ name: 'CR Client', email: email() })).id)
  const projectId = conv.projectId as string
  await prisma.project.update({ where: { id: projectId }, data: { lifecycleStatus: lifecycle } })
  await seedProjectWorkflow(projectId)
  return projectId
}

async function bookedJob(): Promise<string> {
  const projectId = await confirmedJob()
  await prisma.workItem.updateMany({
    where: { projectId, type: 'SHOOT' },
    data: { dueOverrideAt: new Date('2027-06-20T00:00:00Z') },
  })
  return projectId
}

const dueValueOf = async (projectId: string, title: string): Promise<string | null> => {
  const board = await getProjectBoard(projectId)
  return board.stages.flatMap((s) => s.tasks).find((t) => t.title === title)?.dueValue ?? null
}

const shootMoves = (projectId: string) =>
  prisma.auditLog.count({ where: { entityId: projectId, action: 'project.shoot_rescheduled' } })

describe('Change Requests against a real DB (docs/25 Part 3)', () => {
  it('C-a: reschedule + fee → shoot moved AND an adjustment invoice is issued (one transaction)', async () => {
    const projectId = await bookedJob()
    const cr = await createChangeRequest(
      projectId,
      { kind: 'reschedule', newStartsAt: '2027-07-04T10:00', fee: { amount: '300' } },
      { requestedByType: 'staff' },
    )
    await assessChangeRequest(cr.id)
    await approveChangeRequest(cr.id, null)
    await recordClientAgreement(cr.id, { via: 'email' })
    await applyChangeRequest(cr.id, null)

    expect(await dueValueOf(projectId, 'Mark shoot completed')).toBe('2027-07-04')
    const adj = await prisma.invoice.findMany({ where: { projectId, type: 'SUPPLEMENTARY', status: 'ISSUED' } })
    expect(adj).toHaveLength(1)
  })

  it('C-b: two concurrent Apply → exactly one succeeds; the shoot moves once', async () => {
    const projectId = await bookedJob()
    const cr = await createChangeRequest(
      projectId,
      { kind: 'reschedule', newStartsAt: '2027-07-04T10:00' },
      { requestedByType: 'staff' },
    )
    await assessChangeRequest(cr.id)
    await approveChangeRequest(cr.id, null)
    const r = await Promise.allSettled([applyChangeRequest(cr.id, null), applyChangeRequest(cr.id, null)])
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
    expect(await shootMoves(projectId)).toBe(1)
  })

  it('C-c: a shoot date changed after assessment blocks apply until it is re-assessed', async () => {
    const projectId = await bookedJob()
    const cr = await createChangeRequest(
      projectId,
      { kind: 'reschedule', newStartsAt: '2027-07-04T10:00' },
      { requestedByType: 'staff' },
    )
    await assessChangeRequest(cr.id)
    await approveChangeRequest(cr.id, null)

    await prisma.workItem.updateMany({ where: { projectId, type: 'SHOOT' }, data: { dueOverrideAt: new Date('2027-06-27T00:00:00Z') } })
    await expect(applyChangeRequest(cr.id, null)).rejects.toThrow(/re-assess/i)
    const crAfter = await prisma.changeRequest.findUnique({ where: { id: cr.id }, select: { status: true } })
    expect(crAfter?.status).toBe('APPROVED')
    expect(await dueValueOf(projectId, 'Mark shoot completed')).toBe('2027-06-27')
  })

  it('C-d: reschedule to an earlier date re-anchors the shoot tasks to the earlier date', async () => {
    const projectId = await bookedJob()
    expect(await dueValueOf(projectId, 'Mark shoot completed')).toBe('2027-06-20')
    expect(await dueValueOf(projectId, 'Send pre-shoot reminder')).toBe('2027-06-13')
    const cr = await createChangeRequest(
      projectId,
      { kind: 'reschedule', newStartsAt: '2027-06-06T10:00' },
      { requestedByType: 'staff' },
    )
    await assessChangeRequest(cr.id)
    await approveChangeRequest(cr.id, null)
    await applyChangeRequest(cr.id, null)
    expect(await dueValueOf(projectId, 'Mark shoot completed')).toBe('2027-06-06')
    expect(await dueValueOf(projectId, 'Send pre-shoot reminder')).toBe('2027-05-30')
  })

  it('C-e: reschedule to the past is blocked at apply', async () => {
    const projectId = await bookedJob()
    const cr = await createChangeRequest(
      projectId,
      { kind: 'reschedule', newStartsAt: '2020-01-01T10:00' },
      { requestedByType: 'staff' },
    )
    await assessChangeRequest(cr.id)
    await approveChangeRequest(cr.id, null)
    await expect(applyChangeRequest(cr.id, null)).rejects.toThrow(/past/i)
  })

  it('C-f: client declines a scope change → shoot not moved; agreed price unchanged', async () => {
    const projectId = await bookedJob()

    const q = await createQuote(projectId, null)
    await saveQuoteDraft(q.versionId, [{ description: 'Base', quantity: 1, unitPrice: '2000' }], null)
    await prisma.quoteVersion.update({ where: { id: q.versionId }, data: { status: 'ACCEPTED', total: '2000' } })

    const cr = await createChangeRequest(
      projectId,
      { kind: 'scopeChange', summary: 'Add a second photographer', fee: { amount: '800' } },
      { requestedByType: 'client' },
    )
    await assessChangeRequest(cr.id)
    await approveChangeRequest(cr.id, null)
    await rejectChangeRequest(cr.id, 'Client declined the revised quote', null)
    await expect(applyChangeRequest(cr.id, null)).rejects.toThrow()

    const accepted = await prisma.quoteVersion.findMany({ where: { quoteId: q.quoteId, status: 'ACCEPTED' } })
    expect(accepted).toHaveLength(1)
    expect(accepted[0]!.total.toString()).toBe('2000')
    expect(await shootMoves(projectId)).toBe(0)
  })

  it('C-h: production revision after delivery is allowed and creates a revision task with a due date', async () => {
    const projectId = await confirmedJob('COMPLETED')
    const cr = await createChangeRequest(
      projectId,
      { kind: 'production', summary: 'Re-edit the highlight reel', dueAt: '2027-08-01' },
      { requestedByType: 'client' },
    )
    await assessChangeRequest(cr.id)
    await approveChangeRequest(cr.id, null)
    await applyChangeRequest(cr.id, null)
    const task = await prisma.workItem.findFirst({
      where: { projectId, title: { startsWith: 'Revision:' } },
      select: { status: true, dueOverrideAt: true },
    })
    expect(task).not.toBeNull()
    expect(task?.status).toBe('PENDING')
    expect(task?.dueOverrideAt).not.toBeNull()
  })
})
