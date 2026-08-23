import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requireCompany } from './project'

/**
 * Package catalogue (F-PKG). Fixed-price service packages, GST-inclusive. Changing a package price
 * later never rewrites past records — pricing history lives as a snapshot on Project/Quote/Invoice
 * (F-PKG-02).
 */

export type PackageInput = {
  name: string
  description?: string | null
  inclusions?: string | null
  durationHours?: number | null
  basePriceInclGst: Prisma.Decimal | string | number
  sortOrder?: number
}

export async function createPackage(input: PackageInput, actorUserId: string | null = null) {
  return prisma.$transaction(async (tx) => {
    const company = await requireCompany(tx)
    const pkg = await tx.package.create({
      data: {
        companyId: company.id,
        name: input.name,
        description: input.description ?? null,
        inclusions: input.inclusions ?? null,
        durationHours: input.durationHours ?? null,
        basePriceInclGst: new Prisma.Decimal(input.basePriceInclGst),
        sortOrder: input.sortOrder ?? 0,
      },
    })
    await tx.auditLog.create({
      data: {
        companyId: company.id,
        action: 'package.created',
        entityType: 'Package',
        entityId: pkg.id,
        actorUserId,
        afterData: { name: pkg.name, price: pkg.basePriceInclGst.toString() },
      },
    })
    return pkg
  })
}

export async function updatePackage(
  packageId: string,
  input: Partial<PackageInput>,
  actorUserId: string | null = null,
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.package.findUnique({ where: { id: packageId } })
    if (!existing) throw new Error('Package not found.')

    const data: Prisma.PackageUpdateInput = {}
    if (input.name !== undefined) data.name = input.name
    if (input.description !== undefined) data.description = input.description
    if (input.inclusions !== undefined) data.inclusions = input.inclusions
    if (input.durationHours !== undefined) data.durationHours = input.durationHours
    if (input.basePriceInclGst !== undefined) {
      data.basePriceInclGst = new Prisma.Decimal(input.basePriceInclGst)
    }
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder

    const pkg = await tx.package.update({ where: { id: packageId }, data })
    await tx.auditLog.create({
      data: {
        companyId: existing.companyId,
        action: 'package.updated',
        entityType: 'Package',
        entityId: pkg.id,
        actorUserId,
        beforeData: { price: existing.basePriceInclGst.toString() },
        afterData: { price: pkg.basePriceInclGst.toString() },
      },
    })
    return pkg
  })
}

/** Activate/deactivate a package. Deactivated packages are hidden from the public list (F-ENTRY-02). */
export async function setPackageActive(
  packageId: string,
  active: boolean,
  actorUserId: string | null = null,
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.package.findUnique({ where: { id: packageId } })
    if (!existing) throw new Error('Package not found.')
    const pkg = await tx.package.update({ where: { id: packageId }, data: { active } })
    await tx.auditLog.create({
      data: {
        companyId: pkg.companyId,
        action: active ? 'package.activated' : 'package.deactivated',
        entityType: 'Package',
        entityId: pkg.id,
        actorUserId,
      },
    })
    return pkg
  })
}

/** Active packages for the public catalogue, in display order. */
export async function listActivePackages() {
  const company = await prisma.company.findFirst({ select: { id: true } })
  if (!company) return []
  return prisma.package.findMany({
    where: { companyId: company.id, active: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
}
