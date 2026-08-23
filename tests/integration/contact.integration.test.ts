import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { addContact, listContacts, setPrimaryContact, updateContact } from '@/lib/domain/contact'
import { convertEnquiry, createEnquiry } from '@/lib/domain/enquiry'

const email = () => `it-${randomUUID()}@moments.test`

async function makeClient() {
  const c = await convertEnquiry((await createEnquiry({ name: 'Contact Owner', email: email() })).id)
  return c.clientId!
}

beforeAll(async () => {
  const company = await prisma.company.findFirst()
  if (!company) await prisma.company.create({ data: { name: 'Integration Studio' } })
})

describe('contacts (integration, real DB)', () => {
  it('the first contact becomes PRIMARY automatically', async () => {
    const clientId = await makeClient()
    const c1 = await addContact(clientId, { name: 'Alex' })
    expect(c1.isPrimary).toBe(true)
    expect(c1.role).toBe('PRIMARY')
  })

  it('a later contact is not primary unless asked; exactly one primary remains', async () => {
    const clientId = await makeClient()
    await addContact(clientId, { name: 'Alex' })
    const c2 = await addContact(clientId, { name: 'Jordan', role: 'PARTNER' })
    expect(c2.isPrimary).toBe(false)
    const contacts = await listContacts(clientId)
    expect(contacts.filter((c) => c.isPrimary).length).toBe(1)
  })

  it('setPrimaryContact moves the primary flag to exactly one contact', async () => {
    const clientId = await makeClient()
    const a = await addContact(clientId, { name: 'Alex' })
    const b = await addContact(clientId, { name: 'Jordan', role: 'PARTNER' })
    await setPrimaryContact(b.id)
    const contacts = await listContacts(clientId)
    const primaries = contacts.filter((c) => c.isPrimary)
    expect(primaries.length).toBe(1)
    expect(primaries[0]!.id).toBe(b.id)
    expect(contacts.find((c) => c.id === a.id)?.isPrimary).toBe(false)
  })

  it('updateContact edits fields/flags without changing the primary', async () => {
    const clientId = await makeClient()
    const a = await addContact(clientId, { name: 'Alex' })
    const updated = await updateContact(a.id, { phone: '0400 111 222', isBilling: true })
    expect(updated.phone).toBe('0400 111 222')
    expect(updated.isBilling).toBe(true)
    expect(updated.isPrimary).toBe(true)
  })
})
