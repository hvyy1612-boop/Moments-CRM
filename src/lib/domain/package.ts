import { prisma } from '@/lib/db'

export async function listActivePackages() {
  const company = await prisma.company.findFirst({ select: { id: true } })
  if (!company) return []
  return prisma.package.findMany({
    where: { companyId: company.id, active: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
}
