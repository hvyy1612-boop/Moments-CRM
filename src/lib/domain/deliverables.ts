import type { DeliverableType } from '@prisma/client'
import { prisma } from '@/lib/db'

const PACKAGE_DELIVERABLES: Record<string, DeliverableType[]> = {
  'WED-PHOTO': ['SNEAK_PEEK', 'PHOTO_GALLERY'],
  'WED-VIDEO': ['VIDEO_FILM'],
  'MICRO-PHOTO': ['SNEAK_PEEK', 'PHOTO_GALLERY'],
  'MICRO-VIDEO': ['VIDEO_FILM'],
  'PRE-WED': ['PORTRAIT_GALLERY'],
}

const ADDON_DELIVERABLES: Record<string, DeliverableType[]> = {
  ALBUM: ['ALBUM'],
  'ALBUM-PAR': ['ALBUM'],
  'FILM-35': ['FILM_SCANS'],
  'FILM-120': ['FILM_SCANS'],
  SUPER8: ['VIDEO_FILM'],
  'RAW-FOOT': ['RAW_FOOTAGE'], // BR-D10: only orderable before the shoot, enforced in the builder
}

export async function deliverablesForLines(quotationId: string): Promise<DeliverableType[]> {
  const lines = await prisma.quotationLine.findMany({
    where: { quotationId, sourceType: { in: ['PACKAGE', 'ADDON'] } },
    select: { sourceType: true, sourceId: true },
  })

  const packageIds = lines.filter((l) => l.sourceType === 'PACKAGE').map((l) => l.sourceId)
  const addOnIds = lines.filter((l) => l.sourceType === 'ADDON').map((l) => l.sourceId)

  const [packages, addOns] = await Promise.all([
    prisma.package.findMany({
      where: { id: { in: packageIds.filter((id): id is string => Boolean(id)) } },
      select: { code: true },
    }),
    prisma.addOn.findMany({
      where: { id: { in: addOnIds.filter((id): id is string => Boolean(id)) } },
      select: { code: true },
    }),
  ])

  const types = new Set<DeliverableType>()
  for (const pkg of packages) {
    for (const type of PACKAGE_DELIVERABLES[pkg.code] ?? []) types.add(type)
  }
  for (const addOn of addOns) {
    for (const type of ADDON_DELIVERABLES[addOn.code] ?? []) types.add(type)
  }
  return [...types]
}

export const DELIVERABLE_LABEL: Record<DeliverableType, string> = {
  SNEAK_PEEK: 'Sneak peek',
  PHOTO_GALLERY: 'Photo gallery',
  VIDEO_FILM: 'Wedding film',
  ALBUM: 'Album',
  FILM_SCANS: 'Film scans',
  PORTRAIT_GALLERY: 'Portrait gallery',
  RAW_FOOTAGE: 'Raw footage',
}
