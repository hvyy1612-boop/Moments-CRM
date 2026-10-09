import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createEnquiry } from '@/lib/domain/enquiry'
import { addEnquiryStage, deleteEnquiryTask, toggleEnquiryTask, getEnquiryBoard, renameEnquiryStage } from '@/lib/domain/enquiry-workflow'

/** Bug-scan 2026-10-05 (C): lead custom stages and stage sync, against the (test) database. */

let userId = ''
beforeAll(async () => {
  userId = (await prisma.user.findFirstOrThrow({ select: { id: true } })).id
})
const newLead = async () => (await createEnquiry({ name: 'Stage Lead', email: `st-${randomUUID().slice(0, 8)}@moments.test` })).id

describe('lead custom stages', () => {
  it('list in the order they were added, and a duplicate name is refused', async () => {
    const id = await newLead()
    await addEnquiryStage(id, 'Album design', userId)
    await addEnquiryStage(id, 'Second shooter', userId)
    await expect(addEnquiryStage(id, 'Album design', userId)).rejects.toThrow(/already exists/i)
    await expect(renameEnquiryStage(id, 'Second shooter', 'Album design', userId)).rejects.toThrow(/already exists/i)
    const custom = (await getEnquiryBoard(id)).stages.filter((s) => s.custom).map((s) => s.key)
    expect(custom).toEqual(['Album design', 'Second shooter'])
    expect(await prisma.workItem.count({ where: { enquiryId: id, stage: 'Album design' } })).toBe(1)
  })
})

describe('deleting a task moves the status like unticking it would', () => {
  it('deleting the only ticked Contacted task takes the lead back to New enquiry', async () => {
    const id = await newLead()
    const contact = await prisma.workItem.findFirstOrThrow({ where: { enquiryId: id, stage: 'discussion' }, select: { id: true } })
    await toggleEnquiryTask(contact.id, userId)
    expect((await prisma.enquiry.findUniqueOrThrow({ where: { id } })).status).toBe('CONTACTED')
    await deleteEnquiryTask(contact.id, userId)
    expect((await prisma.enquiry.findUniqueOrThrow({ where: { id } })).status).toBe('NEW_ENQUIRY')
  })
})
