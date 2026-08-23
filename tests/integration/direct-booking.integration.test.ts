import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { confirmBookingByToken, createProjectFromPackage } from '@/lib/domain/direct-booking'
import { createPackage, setPackageActive } from '@/lib/domain/package'

const email = () => `it-${randomUUID()}@moments.test`

let packageId: string

beforeAll(async () => {
  const company = await prisma.company.findFirst()
  if (!company) await prisma.company.create({ data: { name: 'Integration Studio' } })
  const pkg = await createPackage({ name: 'Wedding — Full Day', basePriceInclGst: '3500' })
  packageId = pkg.id
})

describe('direct package booking (integration, real DB)', () => {
  it('creates a package that is active with the given price', async () => {
    const pkg = await prisma.package.findUnique({ where: { id: packageId } })
    expect(pkg?.active).toBe(true)
    expect(pkg?.basePriceInclGst.toString()).toBe('3500')
  })

  it('books directly: BOOKING_REQUESTED project, price snapshot, confirm token, DIRECT_BOOKING client', async () => {
    const r = await createProjectFromPackage({ packageId, name: 'Direct Booker', email: email() })
    expect(r.confirmToken).toBeTruthy()
    const project = await prisma.project.findUnique({ where: { id: r.projectId } })
    const client = await prisma.client.findUnique({ where: { id: r.clientId } })
    expect(project?.lifecycleStatus).toBe('BOOKING_REQUESTED')
    expect(project?.packageId).toBe(packageId)
    expect(project?.packagePriceSnapshot?.toString()).toBe('3500')
    expect(client?.source).toBe('DIRECT_BOOKING')
  })

  it('dedups the booker by email (returning booker reuses the client)', async () => {
    const mail = email()
    const r1 = await createProjectFromPackage({ packageId, name: 'Repeat Booker', email: mail })
    const r2 = await createProjectFromPackage({ packageId, name: 'Repeat Booker', email: mail })
    expect(r2.clientId).toBe(r1.clientId)
    expect(r2.projectId).not.toBe(r1.projectId)
  })

  it('confirms by token → CONFIRMED + client ACTIVE, idempotently', async () => {
    const r = await createProjectFromPackage({ packageId, name: 'Confirmer', email: email() })
    const c1 = await confirmBookingByToken(r.confirmToken!)
    expect(c1.alreadyConfirmed).toBe(false)
    const project = await prisma.project.findUnique({ where: { id: r.projectId } })
    const client = await prisma.client.findUnique({ where: { id: r.clientId } })
    expect(project?.lifecycleStatus).toBe('CONFIRMED')
    expect(project?.confirmedByClientAt).not.toBeNull()
    expect(client?.status).toBe('ACTIVE')

    const c2 = await confirmBookingByToken(r.confirmToken!)
    expect(c2.alreadyConfirmed).toBe(true)
  })

  it('refuses to book a deactivated package', async () => {
    const pkg = await createPackage({ name: 'Retired Package', basePriceInclGst: '900' })
    await setPackageActive(pkg.id, false)
    await expect(
      createProjectFromPackage({ packageId: pkg.id, name: 'Too Late', email: email() }),
    ).rejects.toThrow()
  })
})
