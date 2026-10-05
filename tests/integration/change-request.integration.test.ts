import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createEnquiry, convertEnquiry } from '@/lib/domain/enquiry'
import { createBooking, assignResource } from '@/lib/domain/booking'
import { createQuote, saveQuoteDraft } from '@/lib/domain/quote'
import { getProjectBoard, seedProjectWorkflow } from '@/lib/domain/project-workflow'
import {
  applyChangeRequest,
  approveChangeRequest,
  assessChangeRequest,
  createChangeRequest,
  editChangeRequestPayload,
  recordClientAgreement,
  rejectChangeRequest,
} from '@/lib/domain/change-request'

const email = () => `cr-${randomUUID()}@moments.test`
let companyId: string

beforeAll(async () => {
  const company = (await prisma.company.findFirst()) ?? (await prisma.company.create({ data: { name: 'Integration Studio' } }))
  companyId = company.id
})

async function confirmedJob(lifecycle: 'CONFIRMED' | 'COMPLETED' = 'CONFIRMED'): Promise<string> {
  const conv = await convertEnquiry((await createEnquiry({ name: 'CR Client', email: email() })).id)
  const projectId = conv.projectId as string
  await prisma.project.update({ where: { id: projectId }, data: { lifecycleStatus: lifecycle } })
  await seedProjectWorkflow(projectId)
  return projectId
}

async function bookedJob(): Promise<{ projectId: string; bookingId: string }> {
  const projectId = await confirmedJob()
  const b = await createBooking(projectId, { startsAt: '2027-06-20T10:00', endsAt: '2027-06-20T18:00' }, null)
  return { projectId, bookingId: b.id }
}

const dueValueOf = async (projectId: string, title: string): Promise<string | null> => {
  const board = await getProjectBoard(projectId)
  return board.stages.flatMap((s) => s.tasks).find((t) => t.title === title)?.dueValue ?? null
}

describe('Change Requests against a real DB (docs/25 Part 3)', () => {
  it('C-a: reschedule + fee → booking moved AND an adjustment invoice is issued (one transaction)', async () => {
    const { projectId, bookingId } = await bookedJob()
    const cr = await createChangeRequest(
      projectId,
      { kind: 'reschedule', bookingId, newStartsAt: '2027-07-04T10:00', newEndsAt: '2027-07-04T18:00', fee: { amount: '300' } },
      { requestedByType: 'staff' },
    )
    await assessChangeRequest(cr.id)
    await approveChangeRequest(cr.id, null)
    await recordClientAgreement(cr.id, { via: 'email' }) // fee ⇒ agreement required
    await applyChangeRequest(cr.id, null)

    const old = await prisma.booking.findUnique({ where: { id: bookingId }, select: { status: true } })
    expect(old?.status).toBe('CANCELLED')
    const successor = await prisma.booking.findFirst({ where: { rescheduledFromId: bookingId }, select: { status: true } })
    expect(successor?.status).toBe('TENTATIVE') // moved
    const adj = await prisma.invoice.findMany({ where: { projectId, type: 'SUPPLEMENTARY', status: 'ISSUED' } })
    expect(adj).toHaveLength(1)
  })

  it('C-b: two concurrent Apply → exactly one succeeds; one booking successor', async () => {
    const { projectId, bookingId } = await bookedJob()
    const cr = await createChangeRequest(
      projectId,
      { kind: 'reschedule', bookingId, newStartsAt: '2027-07-04T10:00', newEndsAt: '2027-07-04T18:00' },
      { requestedByType: 'staff' },
    )
    await assessChangeRequest(cr.id)
    await approveChangeRequest(cr.id, null)
    const r = await Promise.allSettled([applyChangeRequest(cr.id, null), applyChangeRequest(cr.id, null)])
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
    const successors = await prisma.booking.count({ where: { rescheduledFromId: bookingId } })
    expect(successors).toBe(1)
  })

  it('C-c: a resource taken before apply blocks the reschedule (resource conflict re-check)', async () => {
    const projectId = await confirmedJob()
    const resource = await prisma.resource.create({
      data: { companyId, name: `Cam ${randomUUID().slice(0, 6)}`, resourceType: 'PHOTOGRAPHER', status: 'active' },
    })
    const bJune = await createBooking(projectId, { startsAt: '2027-06-20T10:00', endsAt: '2027-06-20T18:00' }, null)
    await assignResource(bJune.id, { resourceId: resource.id }, null)
    const bJuly = await createBooking(projectId, { startsAt: '2027-07-04T10:00', endsAt: '2027-07-04T18:00' }, null)
    await assignResource(bJuly.id, { resourceId: resource.id }, null) // resource now busy on Jul 4

    const cr = await createChangeRequest(
      projectId,
      { kind: 'reschedule', bookingId: bJune.id, newStartsAt: '2027-07-04T12:00', newEndsAt: '2027-07-04T16:00' },
      { requestedByType: 'staff' },
    )
    await assessChangeRequest(cr.id)
    await approveChangeRequest(cr.id, null)
    await expect(applyChangeRequest(cr.id, null)).rejects.toThrow(/already booked/i)
    // The whole transaction rolled back: June booking not moved, request not applied.
    const stillActive = await prisma.booking.findUnique({ where: { id: bJune.id }, select: { status: true } })
    expect(stillActive?.status).toBe('TENTATIVE')
    const crAfter = await prisma.changeRequest.findUnique({ where: { id: cr.id }, select: { status: true } })
    expect(crAfter?.status).toBe('APPROVED') // claim rolled back
  })

  it('C-d: reschedule to an earlier date re-anchors the shoot tasks to the earlier date', async () => {
    const { projectId, bookingId } = await bookedJob()
    expect(await dueValueOf(projectId, 'Mark shoot completed')).toBe('2027-06-20')
    const cr = await createChangeRequest(
      projectId,
      { kind: 'reschedule', bookingId, newStartsAt: '2027-06-06T10:00', newEndsAt: '2027-06-06T18:00' },
      { requestedByType: 'staff' },
    )
    await assessChangeRequest(cr.id)
    await approveChangeRequest(cr.id, null)
    await applyChangeRequest(cr.id, null)
    expect(await dueValueOf(projectId, 'Mark shoot completed')).toBe('2027-06-06')
  })

  it('C-e: reschedule to the past is blocked at apply', async () => {
    const { projectId, bookingId } = await bookedJob()
    const cr = await createChangeRequest(
      projectId,
      { kind: 'reschedule', bookingId, newStartsAt: '2020-01-01T10:00', newEndsAt: '2020-01-01T18:00' },
      { requestedByType: 'staff' },
    )
    await assessChangeRequest(cr.id)
    await approveChangeRequest(cr.id, null)
    await expect(applyChangeRequest(cr.id, null)).rejects.toThrow(/past/i)
  })

  it('C-f: client declines a scope change → booking not moved; agreed price unchanged', async () => {
    const { projectId, bookingId } = await bookedJob()
    // An accepted quote fixes the agreed price.
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
    await rejectChangeRequest(cr.id, 'Client declined the revised quote', null) // decline
    await expect(applyChangeRequest(cr.id, null)).rejects.toThrow() // cannot apply a rejected CR

    const accepted = await prisma.quoteVersion.findMany({ where: { quoteId: q.quoteId, status: 'ACCEPTED' } })
    expect(accepted).toHaveLength(1)
    expect(accepted[0]!.total.toString()).toBe('2000') // agreed price unchanged
    const successor = await prisma.booking.count({ where: { rescheduledFromId: bookingId } })
    expect(successor).toBe(0) // booking not moved
  })

  it('C-g: editing the payload after approval invalidates the approval (back to PENDING)', async () => {
    const { projectId, bookingId } = await bookedJob()
    const cr = await createChangeRequest(
      projectId,
      { kind: 'reschedule', bookingId, newStartsAt: '2027-07-04T10:00', newEndsAt: '2027-07-04T18:00' },
      { requestedByType: 'staff' },
    )
    await assessChangeRequest(cr.id)
    await approveChangeRequest(cr.id, null)
    const edited = await editChangeRequestPayload(
      cr.id,
      { kind: 'reschedule', bookingId, newStartsAt: '2027-07-11T10:00', newEndsAt: '2027-07-11T18:00' },
      null,
    )
    expect(edited.status).toBe('PENDING')
    expect(edited.approvedAt).toBeNull()
    expect(edited.payloadVersion).toBe(2)
    await expect(applyChangeRequest(cr.id, null)).rejects.toThrow(/approve/i) // must re-assess + re-approve
  })

  it('C-h: production revision after delivery is allowed and creates a revision task with a due date', async () => {
    const projectId = await confirmedJob('COMPLETED') // delivered
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
