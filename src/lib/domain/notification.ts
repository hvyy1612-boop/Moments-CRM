import type { NotificationChannel } from '@prisma/client'
import { prisma } from '@/lib/db'

export async function queueNotification(input: {
  clientId?: string | null
  userId?: string | null
  channel: NotificationChannel
  templateKey: string
  recipient: string
  subject?: string | null
  bodyText: string
  scheduledFor?: Date
  relatedType: string
  relatedId: string
}) {
  return prisma.notification.create({
    data: {
      clientId: input.clientId ?? null,
      userId: input.userId ?? null,
      channel: input.channel,
      templateKey: input.templateKey,
      recipient: input.recipient,
      subject: input.subject ?? null,
      bodyText: input.bodyText,
      status: 'QUEUED',
      scheduledFor: input.scheduledFor ?? new Date(),
      relatedType: input.relatedType,
      relatedId: input.relatedId,
    },
  })
}
