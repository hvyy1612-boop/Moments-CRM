import { prisma } from '@/lib/db'

/** Read side of the catalogue. Packages and add-ons the studio shows to couples (Slice 1). */

export function listActivePackages() {
  return prisma.package.findMany({
    where: { isActive: true },
    orderBy: { displayOrder: 'asc' },
  })
}

export function getActivePackage(code: string) {
  return prisma.package.findFirst({ where: { code, isActive: true } })
}

export function listActiveAddOns() {
  return prisma.addOn.findMany({
    where: { isActive: true },
    orderBy: { displayOrder: 'asc' },
  })
}
