import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { getCalendarView } from '@/lib/domain/calendar'
import { cancelBooking, convertEnquiry, createEnquiry } from '@/lib/domain/enquiry'
import { recordPayment } from '@/lib/domain/finance'
import { createInvoice } from './helpers'
import { addProjectStage, addProjectStageBlock, seedProjectWorkflow, toggleProjectTask } from '@/lib/domain/project-workflow'

/** Bug-scan 2026-10-05: workflow / calendar / cancellation fixes against the real (test) database. */

let userId = ''
const email = () => `wf-${randomUUID().slice(0, 8)}@moments.test`

beforeAll(async () => {
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
  it('Cancel job cancels the job; the lead keeps Booking confirmed', async () => {
    const { enquiryId, projectId } = await newJob()
    const inv = await createInvoice(projectId, { type: 'DEPOSIT', description: 'Deposit', amount: '500' }, null)
    await recordPayment(inv.id, { paymentMethod: 'BANK_TRANSFER', amount: '500' }, null) // confirms the booking
    const confirmed = await prisma.project.findUniqueOrThrow({ where: { id: projectId } })
    expect(confirmed.lifecycleStatus).toBe('CONFIRMED')
    expect(confirmed.confirmedByClientAt).not.toBeNull() // "days after booking" tasks have a start date

    await cancelBooking(enquiryId, null)
    expect((await prisma.project.findUnique({ where: { id: projectId } }))?.lifecycleStatus).toBe('CANCELLED')
    expect((await prisma.enquiry.findUnique({ where: { id: enquiryId } }))?.status).toBe('BOOKING_CONFIRMED')
  })
})

describe('shoots on the calendar', () => {
  it("shows each job's shoot date, read-only, and flags two shoots on the same day", async () => {
    const a = await newJob()
    const b = await newJob()
    // Only confirmed bookings are jobs on the calendar: pay each deposit.
    for (const j of [a, b]) {
      const inv = await createInvoice(j.projectId, { type: 'DEPOSIT', description: 'Deposit', amount: '500' }, null)
      await recordPayment(inv.id, { paymentMethod: 'BANK_TRANSFER', amount: '500' }, null)
    }
    // A lead whose quote is accepted but deposit unpaid: its date is not held, so it is not shown.
    const unpaid = await createEnquiry({ name: 'Unpaid', email: email(), eventDate: new Date('2033-03-17T00:00:00Z') })
    const unpaidFile = await convertEnquiry(unpaid.id)
    const shoot = new Date('2033-03-17T00:00:00Z') // 11am Sydney
    await prisma.workItem.updateMany({ where: { projectId: { in: [a.projectId, b.projectId] }, type: 'SHOOT' }, data: { dueOverrideAt: shoot } })

    const cal = await getCalendarView('month', '2033-03-01', 'job')
    const shoots = cal.items.filter((i) => i.kind === 'shoot' && (i.refId === a.projectId || i.refId === b.projectId))
    expect(shoots).toHaveLength(2)
    expect(shoots.every((i) => i.dayKey === '2033-03-17' && !i.editable && i.conflict)).toBe(true)
    expect(cal.items.some((i) => i.refId === unpaidFile.projectId)).toBe(false)
  })
})
