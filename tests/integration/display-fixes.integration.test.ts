import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { getCalendarView } from '@/lib/domain/calendar'
import { convertEnquiry, createEnquiry } from '@/lib/domain/enquiry'
import { createInvoiceWithLines, markOverdueInvoices, recordPayment } from '@/lib/domain/finance'
import { confirmDirectBooking, getProjectBoard } from '@/lib/domain/project-workflow'
import { sydneyLocalToUtc } from '@/lib/time'

/** Bug-scan 2026-10-05 (C): dates and figures that read wrong on screen, against the (test) database. */

let companyId = ''
const email = () => `disp-${randomUUID().slice(0, 8)}@moments.test`
beforeAll(async () => {
  companyId = (await prisma.company.findFirstOrThrow({ select: { id: true } })).id
})

/** A real (confirmed) job: a lead whose deposit is unpaid is still a lead and shows nowhere as a job. */
async function newJob() {
  const e = await createEnquiry({ name: 'Display Client', email: email() })
  const projectId = (await convertEnquiry(e.id)).projectId as string
  await confirmDirectBooking(projectId, null)
  return projectId
}

describe('a late deposit instalment makes a split invoice overdue', () => {
  it('flagged the day after the deposit falls due, not on the day; paying it clears the flag', async () => {
    const projectId = await newJob()
    const inv = await createInvoiceWithLines(projectId, {
      type: 'BALANCE',
      lines: [{ itemName: 'Coverage', description: 'Coverage', quantity: 1, unitPrice: '4000', discount: '' }],
      instalments: [
        { label: 'Deposit (25%)', dueAt: '2026-10-05', amount: '1000' },
        { label: 'Final payment (75%)', dueAt: '2027-05-29', amount: '3000' },
      ],
    }, null)
    const status = async () => (await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status

    await markOverdueInvoices(sydneyLocalToUtc('2026-10-05T16:00'))
    expect(await status()).not.toBe('OVERDUE')
    await markOverdueInvoices(sydneyLocalToUtc('2026-10-06T09:00'))
    expect(await status()).toBe('OVERDUE')

    await recordPayment(inv.id, { paymentMethod: 'BANK_TRANSFER', amount: '1000' }, null)
    await markOverdueInvoices(sydneyLocalToUtc('2026-10-07T09:00'))
    expect(await status()).toBe('PARTIALLY_PAID')
  })
})

describe('the calendar only shows live work', () => {
  it("a cancelled job's pending to-dos leave the calendar", async () => {
    const projectId = await newJob()
    const due = sydneyLocalToUtc('2027-03-17T10:00')
    const task = await prisma.workItem.create({
      data: { companyId, projectId, kind: 'CUSTOM', title: `Calendar check ${randomUUID().slice(0, 6)}`, stage: 'preshoot', type: 'TODO', status: 'PENDING', order: 50, dueOverrideAt: due },
    })
    const onCalendar = async () => (await getCalendarView('week', '2027-03-17', 'job')).items.some((i) => i.refId === task.id)
    expect(await onCalendar()).toBe(true)
    await prisma.project.update({ where: { id: projectId }, data: { lifecycleStatus: 'CANCELLED' } })
    expect(await onCalendar()).toBe(false)
  })
})

describe('a resolved overdue-payment follow-up is not left "Pending" on the job', () => {
  it('cancelled rows are not shown on the board', async () => {
    const projectId = await newJob()
    const row = await prisma.workItem.create({
      data: { companyId, projectId, kind: 'OVERDUE_FOLLOWUP', stage: 'delivery', type: 'TODO', title: 'Follow up overdue payment (x)', status: 'CANCELLED', order: 9999 },
    })
    const board = await getProjectBoard(projectId)
    expect(board.stages.flatMap((s) => s.tasks).some((t) => t.id === row.id)).toBe(false)
  })
})
