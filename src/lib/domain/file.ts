import type { FileKind, FileVisibility } from '@prisma/client'
import { prisma } from '@/lib/db'

/** Project files (F-PORTAL-02). v1 stores an external URL; only http/https is allowed, matching the
 *  gallery rule. A client (portal) only ever sees CLIENT_VISIBLE files. */

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

/** Staff see every file; pass clientVisibleOnly for what the portal may show. */
export async function listFiles(projectId: string, opts: { clientVisibleOnly?: boolean } = {}) {
  return prisma.file.findMany({
    where: {
      projectId,
      ...(opts.clientVisibleOnly ? { visibility: 'CLIENT_VISIBLE' } : {}),
    },
    orderBy: { createdAt: 'desc' },
  })
}
