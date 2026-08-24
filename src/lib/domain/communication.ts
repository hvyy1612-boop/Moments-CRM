import type { CommunicationType } from '@prisma/client'
import { prisma } from '@/lib/db'

export type CommunicationInput = {
  type: CommunicationType
  direction: 'inbound' | 'outbound'
  body: string
  subject?: string | null
  channel?: string | null
  clientId?: string | null
  byUserId?: string | null
}

export async function logCommunication(projectId: string, input: CommunicationInput) {
  return prisma.communication.create({
    data: {
      projectId,
      clientId: input.clientId ?? null,
      type: input.type,
      direction: input.direction,
      subject: input.subject ?? null,
      body: input.body,
      byUserId: input.byUserId ?? null,
      channel: input.channel ?? null,
    },
  })
}

export async function listCommunications(projectId: string) {
  return prisma.communication.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
  })
}
