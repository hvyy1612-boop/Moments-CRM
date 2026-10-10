import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createEnquiry, convertEnquiry } from '@/lib/domain/enquiry'
import { getProjectBoard, seedProjectWorkflow, updateProjectTask } from '@/lib/domain/project-workflow'

const email = () => `deadline-${randomUUID()}@moments.test`

beforeAll(async () => {
  const company = await prisma.company.findFirst()
  if (!company) await prisma.company.create({ data: { name: 'Integration Studio' } })
})

async function confirmedJob(eventDate: Date | null = null): Promise<string> {
  const conv = await convertEnquiry((await createEnquiry({ name: 'Shoot Client', email: email(), eventDate })).id)
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

const taskId = async (projectId: string, title: string) =>
  (await getProjectBoard(projectId)).stages.flatMap((s) => s.tasks).find((t) => t.title === title)!.id

const SHOOT = 'Mark shoot completed'
const BACKUP = 'Send files to editor'
const at10am = (ymd: string) => new Date(`${ymd}T00:00:00Z`)

describe('Deadline foundation against a real DB (docs/25 Part 2)', () => {
  it('a job with no shoot date yet has undated shoot tasks', async () => {
    const projectId = await confirmedJob()
    expect(await dueValueOf(projectId, SHOOT)).toBeNull()
    expect(await dueValueOf(projectId, BACKUP)).toBeNull()
  })

  it("the lead's event date dates the shoot-anchored tasks by anchor + offset (Rule D0)", async () => {
    const projectId = await confirmedJob(at10am('2026-06-20'))
    expect(await dueValueOf(projectId, SHOOT)).toBe('2026-06-20')
    expect(await dueValueOf(projectId, BACKUP)).toBe('2026-06-22')
  })

  it('setting the shoot date on the Shoot task moves every shoot task (Rule D2)', async () => {
    const projectId = await confirmedJob(at10am('2026-06-20'))
    await updateProjectTask(await taskId(projectId, SHOOT), SHOOT, at10am('2026-07-04'), null)
    expect(await dueValueOf(projectId, SHOOT)).toBe('2026-07-04')
    expect(await dueValueOf(projectId, BACKUP)).toBe('2026-07-06')

    await updateProjectTask(await taskId(projectId, SHOOT), SHOOT, at10am('2026-06-06'), null)
    expect(await dueValueOf(projectId, BACKUP)).toBe('2026-06-08')
  })

  it('a date set by hand on another task stays put when the shoot moves (Rule D1/D5)', async () => {
    const projectId = await confirmedJob(at10am('2026-06-20'))
    await updateProjectTask(await taskId(projectId, BACKUP), BACKUP, at10am('2026-06-25'), null)
    await updateProjectTask(await taskId(projectId, SHOOT), SHOOT, at10am('2026-07-04'), null)
    expect(await dueValueOf(projectId, BACKUP)).toBe('2026-06-25')
  })

  it("clearing the Shoot task date falls back to the lead's event date (Rule D1)", async () => {
    const projectId = await confirmedJob(at10am('2026-06-20'))
    const id = await taskId(projectId, SHOOT)
    await updateProjectTask(id, SHOOT, at10am('2026-06-25'), null)
    expect(await dueValueOf(projectId, BACKUP)).toBe('2026-06-27')
    await updateProjectTask(id, SHOOT, null, null)
    expect(await dueValueOf(projectId, SHOOT)).toBe('2026-06-20')
    expect(await dueValueOf(projectId, BACKUP)).toBe('2026-06-22')
  })
})
