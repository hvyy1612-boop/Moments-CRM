import { prisma } from '@/lib/db'

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
