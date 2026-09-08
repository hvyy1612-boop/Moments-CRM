import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createEnquiry, convertEnquiry } from '@/lib/domain/enquiry'
import { createBooking, rescheduleBooking } from '@/lib/domain/booking'
import { getProjectBoard, seedProjectWorkflow, updateProjectTask } from '@/lib/domain/project-workflow'

const email = () => `deadline-${randomUUID()}@moments.test`

beforeAll(async () => {
  const company = await prisma.company.findFirst()
  if (!company) await prisma.company.create({ data: { name: 'Integration Studio' } })
})

async function confirmedJob(): Promise<string> {
  const conv = await convertEnquiry((await createEnquiry({ name: 'Shoot Client', email: email() })).id)
  const projectId = conv.projectId as string
  await prisma.project.update({ where: { id: projectId }, data: { lifecycleStatus: 'CONFIRMED' } })
  await seedProjectWorkflow(projectId)
  return projectId
}

async function dueValueOf(projectId: string, title: string): Promise<string | null> {
  const board = await getProjectBoard(projectId)
  for (const stage of board.stages) {
    const t = stage.tasks.find((x) => x.title === title)
    if (t) return t.dueValue
  }
  return null
}

const WEDDING = 'Photograph and film the wedding day'
const BACKUP = 'Back up all captured files'

describe('Deadline foundation against a real DB (docs/25 Part 2)', () => {
  it('a shoot task with no booking yet has no due date (undated until a shoot exists)', async () => {
    const projectId = await confirmedJob()
    expect(await dueValueOf(projectId, WEDDING)).toBeNull()
  })

  it('booking a shoot dates the shoot-anchored tasks by anchor + offset (Rule D0)', async () => {
    const projectId = await confirmedJob()
    await createBooking(projectId, { startsAt: '2026-06-20T10:00', endsAt: '2026-06-20T18:00' }, null)
    expect(await dueValueOf(projectId, WEDDING)).toBe('2026-06-20')
    expect(await dueValueOf(projectId, BACKUP)).toBe('2026-06-21')
  })

  it('rescheduling recomputes (Rule D2): no stored date is shifted; tasks follow the new shoot', async () => {
    const projectId = await confirmedJob()
    const b = await createBooking(projectId, { startsAt: '2026-06-20T10:00', endsAt: '2026-06-20T18:00' }, null)
    await rescheduleBooking(b.id, { startsAt: '2026-07-04T10:00', endsAt: '2026-07-04T18:00' }, null)
    expect(await dueValueOf(projectId, WEDDING)).toBe('2026-07-04')
    expect(await dueValueOf(projectId, BACKUP)).toBe('2026-07-05')
  })

  it('rescheduling to an earlier date anchors the tasks to the earlier date (Rule D3)', async () => {
    const projectId = await confirmedJob()
    const b = await createBooking(projectId, { startsAt: '2026-06-20T10:00', endsAt: '2026-06-20T18:00' }, null)
    await rescheduleBooking(b.id, { startsAt: '2026-06-06T10:00', endsAt: '2026-06-06T18:00' }, null)
    expect(await dueValueOf(projectId, WEDDING)).toBe('2026-06-06')
  })

  it('a manual override does NOT move on reschedule (Rule D1/D5)', async () => {
    const projectId = await confirmedJob()
    const b = await createBooking(projectId, { startsAt: '2026-06-20T10:00', endsAt: '2026-06-20T18:00' }, null)

    const board = await getProjectBoard(projectId)
    const weddingTask = board.stages.flatMap((s) => s.tasks).find((t) => t.title === WEDDING)!
    await updateProjectTask(weddingTask.id, WEDDING, new Date('2026-06-25T00:00:00Z'), null)
    expect(await dueValueOf(projectId, WEDDING)).toBe('2026-06-25')
    await rescheduleBooking(b.id, { startsAt: '2026-07-04T10:00', endsAt: '2026-07-04T18:00' }, null)
    expect(await dueValueOf(projectId, WEDDING)).toBe('2026-06-25')
    expect(await dueValueOf(projectId, BACKUP)).toBe('2026-07-05')
  })

  it('clearing the override returns the task to its anchor (Rule D1)', async () => {
    const projectId = await confirmedJob()
    await createBooking(projectId, { startsAt: '2026-06-20T10:00', endsAt: '2026-06-20T18:00' }, null)
    const t = (await getProjectBoard(projectId)).stages.flatMap((s) => s.tasks).find((x) => x.title === WEDDING)!
    await updateProjectTask(t.id, WEDDING, new Date('2026-06-25T00:00:00Z'), null)
    expect(await dueValueOf(projectId, WEDDING)).toBe('2026-06-25')
    await updateProjectTask(t.id, WEDDING, null, null)
    expect(await dueValueOf(projectId, WEDDING)).toBe('2026-06-20')
  })
})
