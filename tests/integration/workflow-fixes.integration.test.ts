import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { assignResource, createBooking } from '@/lib/domain/booking'
import { moveCalendarItem } from '@/lib/domain/calendar'
import { cancelBooking, convertEnquiry, createEnquiry } from '@/lib/domain/enquiry'
import { createInvoice, recordPayment } from '@/lib/domain/finance'
import { addProjectStage, addProjectStageBlock, seedProjectWorkflow, toggleProjectTask } from '@/lib/domain/project-workflow'

/** Bug-scan 2026-10-05: workflow / calendar / cancellation fixes against the real (test) database. */

let companyId = ''
let userId = ''
const email = () => `wf-${randomUUID().slice(0, 8)}@moments.test`

beforeAll(async () => {
  const company = await prisma.company.findFirstOrThrow({ select: { id: true } })
  companyId = company.id
  userId = (await prisma.user.findFirstOrThrow({ select: { id: true } })).id
})

async function newJob() {
  const e = await createEnquiry({ name: 'Workflow', email: email() })
  const conv = await convertEnquiry(e.id)
  const projectId = conv.projectId as string
  await seedProjectWorkflow(projectId)
  return { enquiryId: e.id, projectId }
}

const tasksOf = (projectId: string) =>
  prisma.workItem.findMany({ where: { projectId }, select: { id: true, title: true, stage: true, status: true, order: true }, orderBy: [{ stage: 'asc' }, { order: 'asc' }] })
const CORE = new Set(['preshoot', 'shoot', 'editing', 'delivery'])

describe('task cascade stays inside add-on and custom stages', () => {
  it('ticking a Video task does not complete the core production checklist', async () => {
    const { projectId } = await newJob()
    await addProjectStageBlock(projectId, 'video', userId)
    const video = (await tasksOf(projectId)).find((t) => t.stage === 'video')!
    await toggleProjectTask(video.id, userId)
    const after = await tasksOf(projectId)
    expect(after.filter((t) => CORE.has(t.stage ?? '') && t.status === 'COMPLETED')).toHaveLength(0)
    expect(after.find((t) => t.id === video.id)?.status).toBe('COMPLETED')
  })

  it('ticking a task in a custom stage does not complete the core checklist', async () => {
    const { projectId } = await newJob()
    await addProjectStage(projectId, 'Second shooter', userId)
    const custom = (await tasksOf(projectId)).find((t) => t.stage === 'Second shooter')!
    await toggleProjectTask(custom.id, userId)
    expect((await tasksOf(projectId)).filter((t) => CORE.has(t.stage ?? '') && t.status === 'COMPLETED')).toHaveLength(0)
  })

  it('ticking a core task still reconciles earlier core tasks, but never an add-on stage', async () => {
    const { projectId } = await newJob()
    await addProjectStageBlock(projectId, 'video', userId)
    const editing = (await tasksOf(projectId)).find((t) => t.title === 'Send files to editor')!
    await toggleProjectTask(editing.id, userId)
    const after = await tasksOf(projectId)
    expect(after.filter((t) => (t.stage === 'preshoot' || t.stage === 'shoot') && t.status !== 'COMPLETED')).toHaveLength(0)
    expect(after.filter((t) => t.stage === 'video' && t.status === 'COMPLETED')).toHaveLength(0)
  })
})

describe('cancelling a confirmed booking cancels the whole job', () => {
  it('Cancel job also cancels its shoots and frees the crew; the lead keeps Booking confirmed', async () => {
    const { enquiryId, projectId } = await newJob()
    const inv = await createInvoice(projectId, { type: 'DEPOSIT', description: 'Deposit', amount: '500' }, null)
    await recordPayment(inv.id, { paymentMethod: 'BANK_TRANSFER', amount: '500' }, null) // confirms the booking
    const resource = await prisma.resource.create({ data: { companyId, resourceType: 'PHOTOGRAPHER', name: `Cam ${randomUUID().slice(0, 8)}` } })
    const booking = await createBooking(projectId, { title: 'Shoot', startsAt: '2027-08-14T10:00', endsAt: '2027-08-14T16:00' }, null)
    await assignResource(booking.id, { resourceId: resource.id }, null)

    await cancelBooking(enquiryId, null)
    expect((await prisma.project.findUnique({ where: { id: projectId } }))?.lifecycleStatus).toBe('CANCELLED')
    expect((await prisma.booking.findUnique({ where: { id: booking.id } }))?.status).toBe('CANCELLED')
    expect(await prisma.resourceAssignment.count({ where: { bookingId: booking.id, status: 'ACTIVE' } })).toBe(0)
    expect((await prisma.enquiry.findUnique({ where: { id: enquiryId } }))?.status).toBe('BOOKING_CONFIRMED')
  })
})

describe('dragging a shoot on the calendar', () => {
  it('moves the crew window with the shoot and refuses a clash', async () => {
    const { projectId } = await newJob()
    const inv = await createInvoice(projectId, { type: 'DEPOSIT', description: 'Deposit', amount: '500' }, null)
    await recordPayment(inv.id, { paymentMethod: 'BANK_TRANSFER', amount: '500' }, null) // shoots need a confirmed job
    const resource = await prisma.resource.create({ data: { companyId, resourceType: 'PHOTOGRAPHER', name: `Cam ${randomUUID().slice(0, 8)}` } })
    const first = await createBooking(projectId, { title: 'Shoot A', startsAt: '2027-09-10T10:00', endsAt: '2027-09-10T12:00' }, null)
    await assignResource(first.id, { resourceId: resource.id }, null)
    const second = await createBooking(projectId, { title: 'Shoot B', startsAt: '2027-09-10T18:00', endsAt: '2027-09-10T20:00' }, null)
    await assignResource(second.id, { resourceId: resource.id }, null)

    await moveCalendarItem('booking', first.id, '2027-09-10', 14 * 60, userId) // 14:00-16:00
    const moved = await prisma.booking.findUnique({ where: { id: first.id }, select: { startsAt: true, status: true } })
    const crew = await prisma.resourceAssignment.findFirst({ where: { bookingId: first.id, status: 'ACTIVE' } })
    expect(crew?.startsAt.toISOString()).toBe(moved?.startsAt.toISOString())
    expect(moved?.status).not.toBe('CANCELLED')

    await expect(moveCalendarItem('booking', first.id, '2027-09-10', 18 * 60, userId)).rejects.toThrow(/already booked/i)
  })
})
