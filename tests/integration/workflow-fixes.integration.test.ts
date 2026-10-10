import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { getCalendarView } from '@/lib/domain/calendar'
import { cancelBooking, convertEnquiry, createEnquiry } from '@/lib/domain/enquiry'
import { recordPayment } from '@/lib/domain/finance'
import { createInvoice } from './helpers'
import { addProjectStage, addProjectStageBlock, addProjectTask, getProjectBoard, seedProjectWorkflow, toggleProjectTask, updateProjectTask } from '@/lib/domain/project-workflow'
import { addEnquiryTask, getEnquiryBoard, updateEnquiryTask } from '@/lib/domain/enquiry-workflow'

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
    await recordPayment(inv.id, { paymentMethod: 'BANK_TRANSFER', amount: '500' }, null)
    const confirmed = await prisma.project.findUniqueOrThrow({ where: { id: projectId } })
    expect(confirmed.lifecycleStatus).toBe('CONFIRMED')
    expect(confirmed.confirmedByClientAt).not.toBeNull()

    await cancelBooking(enquiryId, null)
    expect((await prisma.project.findUnique({ where: { id: projectId } }))?.lifecycleStatus).toBe('CANCELLED')
    expect((await prisma.enquiry.findUnique({ where: { id: enquiryId } }))?.status).toBe('BOOKING_CONFIRMED')
  })
})

describe('shoots on the calendar', () => {
  it("shows each job's shoot date, read-only, and flags two shoots on the same day", async () => {
    const a = await newJob()
    const b = await newJob()

    for (const j of [a, b]) {
      const inv = await createInvoice(j.projectId, { type: 'DEPOSIT', description: 'Deposit', amount: '500' }, null)
      await recordPayment(inv.id, { paymentMethod: 'BANK_TRANSFER', amount: '500' }, null)
    }

    const unpaid = await createEnquiry({ name: 'Unpaid', email: email(), eventDate: new Date('2033-03-17T00:00:00Z') })
    const unpaidFile = await convertEnquiry(unpaid.id)
    const shoot = new Date('2033-03-17T00:00:00Z')
    await prisma.workItem.updateMany({ where: { projectId: { in: [a.projectId, b.projectId] }, type: 'SHOOT' }, data: { dueOverrideAt: shoot } })

    const cal = await getCalendarView('month', '2033-03-01', 'job')
    const shoots = cal.items.filter((i) => i.kind === 'shoot' && (i.refId === a.projectId || i.refId === b.projectId))
    expect(shoots).toHaveLength(2)
    expect(shoots.every((i) => i.dayKey === '2033-03-17' && !i.editable && i.conflict)).toBe(true)
    expect(cal.items.some((i) => i.refId === unpaidFile.projectId)).toBe(false)
  })
})

describe('adding workflow tasks: to-do, extra shoot, appointment', () => {
  it('an extra shoot shows on the calendar as a shoot but never moves the main shoot date', async () => {
    const staff = await prisma.user.findFirstOrThrow({ select: { id: true } })
    const job = await newJob()
    const inv = await createInvoice(job.projectId, { type: 'DEPOSIT', description: 'Deposit', amount: '500' }, null)
    await recordPayment(inv.id, { paymentMethod: 'BANK_TRANSFER', amount: '500' }, null)
    const main = new Date('2034-05-06T00:00:00Z')
    await prisma.workItem.updateMany({ where: { projectId: job.projectId, type: 'SHOOT' }, data: { dueOverrideAt: main } })
    const extraAt = new Date('2034-05-02T01:00:00Z')
    await addProjectTask(job.projectId, 'shoot', 'Engagement shoot', 'EXTRA_SHOOT', extraAt, staff.id)

    const added = await prisma.workItem.findFirstOrThrow({ where: { projectId: job.projectId, title: 'Engagement shoot' } })
    expect(added.type).toBe('EXTRA_SHOOT')
    const cal = await getCalendarView('month', '2034-05-01', 'job')
    const extra = cal.items.find((i) => i.refId === added.id)
    expect(extra?.kind).toBe('shoot')
    expect(extra?.dayKey).toBe('2034-05-02')

    expect(cal.items.find((i) => i.refId === job.projectId)?.dayKey).toBe('2034-05-06')
  })

  it('only the offered types can be added: no main SHOOT or Auto email on a job, no shoots on a lead', async () => {
    const staff = await prisma.user.findFirstOrThrow({ select: { id: true } })
    const job = await newJob()
    const at = new Date('2034-06-01T01:00:00Z')
    await addProjectTask(job.projectId, 'preshoot', 'Sneaky shoot', 'SHOOT', at, staff.id)
    await addProjectTask(job.projectId, 'preshoot', 'Fake automation', 'AUTO_EMAIL', at, staff.id)
    const rows = await prisma.workItem.findMany({ where: { projectId: job.projectId, title: { in: ['Sneaky shoot', 'Fake automation'] } } })
    expect(rows.map((r) => r.type)).toEqual(['TODO', 'TODO'])

    const lead = await createEnquiry({ name: 'Lead tasks', email: email() })
    await addEnquiryTask(lead.id, 'new', 'Shoot on a lead', 'EXTRA_SHOOT', at, staff.id)
    await addEnquiryTask(lead.id, 'new', 'Consultation call', 'APPOINTMENT', at, staff.id)
    const leadRows = await prisma.workItem.findMany({ where: { enquiryId: lead.id, kind: 'CUSTOM' }, orderBy: { order: 'asc' } })
    expect(leadRows.map((r) => [r.title, r.type])).toEqual([['Shoot on a lead', 'TODO'], ['Consultation call', 'APPOINTMENT']])
  })
})

describe('task due dates: no due date, relative, absolute (Studio Ninja)', () => {
  const rowOf = async (projectId: string, title: string) =>
    (await getProjectBoard(projectId)).stages.flatMap((st) => st.tasks).find((t) => t.title === title)

  it('a relative job task follows the main shoot; "no due date" stays undated; a set day has no time', async () => {
    const staff = await prisma.user.findFirstOrThrow({ select: { id: true } })
    const job = await newJob()
    const shoot = new Date('2035-06-20T00:00:00Z')
    await prisma.workItem.updateMany({ where: { projectId: job.projectId, type: 'SHOOT' }, data: { dueOverrideAt: shoot } })

    await addProjectTask(job.projectId, 'preshoot', 'Send timeline form', 'TODO', { kind: 'relative', anchor: 'BEFORE_SHOOT', days: 10 }, staff.id)
    await addProjectTask(job.projectId, 'preshoot', 'Ideas board', 'TODO', { kind: 'none' }, staff.id)
    await addProjectTask(job.projectId, 'editing', 'Order album', 'TODO', { kind: 'absolute', date: '2035-07-01', time: null }, staff.id)

    expect((await rowOf(job.projectId, 'Send timeline form'))?.dueValue).toBe('2035-06-10')
    expect((await rowOf(job.projectId, 'Ideas board'))?.dueLabel).toBeNull()
    expect((await rowOf(job.projectId, 'Order album'))?.dueValue).toBe('2035-07-01')

    await prisma.workItem.updateMany({ where: { projectId: job.projectId, type: 'SHOOT' }, data: { dueOverrideAt: new Date('2035-06-27T00:00:00Z') } })
    expect((await rowOf(job.projectId, 'Send timeline form'))?.dueValue).toBe('2035-06-17')
    expect((await rowOf(job.projectId, 'Order album'))?.dueValue).toBe('2035-07-01')

    const row = await prisma.workItem.findFirstOrThrow({ where: { projectId: job.projectId, title: 'Send timeline form' } })
    await updateProjectTask(row.id, 'Send timeline form', { kind: 'none' }, staff.id)
    expect(await prisma.workItem.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ dueAnchor: null, dueOverrideAt: null, dueDateFixed: null })
  })

  it('lead tasks: the default schedule is stored, "after lead created" works, and "no due date" really clears it', async () => {
    const staff = await prisma.user.findFirstOrThrow({ select: { id: true } })
    const lead = await createEnquiry({ name: 'Due dates', email: email() })
    const seeded = await prisma.workItem.findFirstOrThrow({ where: { enquiryId: lead.id, title: 'Send initial enquiry response' } })
    expect(seeded).toMatchObject({ dueAnchor: 'LEAD_CREATED', dueOffsetDays: 1 })

    await addEnquiryTask(lead.id, 'new', 'Check availability', 'TODO', { kind: 'relative', anchor: 'AFTER_LEAD_CREATED', days: 2 }, staff.id)
    const board = await getEnquiryBoard(lead.id)
    const rows = board.stages.flatMap((st) => st.tasks)
    const created = (await prisma.enquiry.findUniqueOrThrow({ where: { id: lead.id } })).createdAt
    const expected = new Date(created.getTime())
    expected.setDate(expected.getDate() + 2)
    expect(rows.find((t) => t.title === 'Check availability')?.dueLabel).toBeTruthy()

    await updateEnquiryTask(seeded.id, 'Send initial enquiry response', { kind: 'none' }, staff.id)
    const after = (await getEnquiryBoard(lead.id)).stages.flatMap((st) => st.tasks).find((t) => t.id === seeded.id)
    expect(after?.dueLabel).toBeNull()
    expect(expected.getTime()).toBeGreaterThan(created.getTime())
  })
})
