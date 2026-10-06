import { prisma } from '@/lib/db'

/**
 * Package catalogue (F-PKG): the fixed-price service packages (GST-inclusive) staff add to a quote. A
 * quote line keeps its own snapshot, so a later price change never rewrites past quotes (F-PKG-02).
 */

/** Active packages for the public catalogue, in display order. */
export async function listActivePackages() {
  const company = await prisma.company.findFirst({ select: { id: true } })
  if (!company) return []
  return prisma.package.findMany({
    where: { companyId: company.id, active: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
}
