import type { FileKind, FileVisibility } from '@prisma/client'
import { prisma } from '@/lib/db'

export type FileInput = {
  kind: FileKind
  name: string
  url: string
  visibility?: FileVisibility
  sizeBytes?: number | null
  uploadedByUserId?: string | null
}

export async function addFile(projectId: string, input: FileInput) {
  if (!/^https?:\/\//i.test(input.url)) throw new Error('File URL must be http or https.')
  return prisma.file.create({
    data: {
      projectId,
      kind: input.kind,
      name: input.name,
      url: input.url,
      visibility: input.visibility ?? 'INTERNAL',
      sizeBytes: input.sizeBytes ?? null,
      uploadedByUserId: input.uploadedByUserId ?? null,
    },
  })
}

export async function listFiles(projectId: string, opts: { clientVisibleOnly?: boolean } = {}) {
  return prisma.file.findMany({
    where: {
      projectId,
      ...(opts.clientVisibleOnly ? { visibility: 'CLIENT_VISIBLE' } : {}),
    },
    orderBy: { createdAt: 'desc' },
  })
}
