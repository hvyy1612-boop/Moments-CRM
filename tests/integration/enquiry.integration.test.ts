import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { mergeClients } from '@/lib/domain/client'
import {
  convertEnquiry,
  createEnquiry,
  findClientMatches,
  markEnquiryLost,
  reopenEnquiry,
} from '@/lib/domain/enquiry'

const email = () => `it-${randomUUID()}@moments.test`

beforeAll(async () => {
  const company = await prisma.company.findFirst()
  if (!company) await prisma.company.create({ data: { name: 'Integration Studio' } })
})

describe('enquiry backbone (integration, real DB)', () => {
  it('captures a lead without creating a client or project', async () => {
    const e = await createEnquiry({ name: 'Lead One', email: email(), source: 'WEBSITE' })
    expect(e.status).toBe('NEW')
    expect(e.convertedClientId).toBeNull()
    expect(e.convertedProjectId).toBeNull()
  })

  it('converts: upserts a client and creates a QUALIFYING project, idempotently', async () => {
    const e = await createEnquiry({ name: 'Sarah Nguyen', email: email(), eventType: 'Wedding' })
    const r1 = await convertEnquiry(e.id)
    expect(r1.alreadyConverted).toBe(false)

    const project = await prisma.project.findUnique({ where: { id: r1.projectId! } })
    const client = await prisma.client.findUnique({ where: { id: r1.clientId! } })
    expect(project?.lifecycleStatus).toBe('QUALIFYING')
    expect(client?.status).toBe('PROSPECT')
    expect(client?.source).toBe('ENQUIRY')

    const r2 = await convertEnquiry(e.id)
    expect(r2.alreadyConverted).toBe(true)
    expect(r2.clientId).toBe(r1.clientId)
    expect(r2.projectId).toBe(r1.projectId)
  })

  it('dedups by email: a second enquiry with the same email reuses the client', async () => {
    const mail = email()
    const c1 = await convertEnquiry((await createEnquiry({ name: 'Repeat', email: mail })).id)
    const c2 = await convertEnquiry((await createEnquiry({ name: 'Repeat', email: mail })).id)
    expect(c2.clientId).toBe(c1.clientId)
    expect(c2.projectId).not.toBe(c1.projectId)
  })

  it('lost keeps the record; convert is blocked until reopened', async () => {
    const e = await createEnquiry({ name: 'Ghost', email: email() })
    await markEnquiryLost(e.id, 'No response after 3 follow-ups')
    expect((await prisma.enquiry.findUnique({ where: { id: e.id } }))?.status).toBe('LOST')

    await expect(convertEnquiry(e.id)).rejects.toThrow()
    await reopenEnquiry(e.id)
    expect((await prisma.enquiry.findUnique({ where: { id: e.id } }))?.status).toBe('CONTACTED')

    const r = await convertEnquiry(e.id)
    expect(r.alreadyConverted).toBe(false)
  })

  it('a reason is required to mark an enquiry lost', async () => {
    const e = await createEnquiry({ name: 'NoReason', email: email() })
    await expect(markEnquiryLost(e.id, '   ')).rejects.toThrow()
  })

  it('merge moves projects to the survivor; a later enquiry resolves to the survivor', async () => {
    const mailB = email()
    const a = await convertEnquiry((await createEnquiry({ name: 'Client A', email: email() })).id)
    const b = await convertEnquiry((await createEnquiry({ name: 'Client B', email: mailB })).id)

    const res = await mergeClients(a.clientId!, b.clientId!)
    expect(res.movedProjects).toBeGreaterThanOrEqual(1)

    const dup = await prisma.client.findUnique({ where: { id: b.clientId! } })
    expect(dup?.mergedIntoClientId).toBe(a.clientId)
    expect(dup?.status).toBe('ARCHIVED')

    const movedProject = await prisma.project.findUnique({ where: { id: b.projectId! } })
    expect(movedProject?.clientId).toBe(a.clientId)

    const c3 = await convertEnquiry((await createEnquiry({ name: 'Returns', email: mailB })).id)
    expect(c3.clientId).toBe(a.clientId)
  })

  it('findClientMatches suggests by name/phone, with no exact-email match for a stranger', async () => {
    const phone = '0412 000 111'
    const c = await convertEnquiry(
      (await createEnquiry({ name: 'Match Me', email: email(), phone })).id,
    )
    const res = await findClientMatches({
      email: email(),
      name: 'match me',
      phone: '+61 412 000 111',
    })
    expect(res.exact).toBeNull()
    expect(res.possible.map((m) => m.id)).toContain(c.clientId)
  })
})
