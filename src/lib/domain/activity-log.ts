import type { ActorType, Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

// Keys whose values must never reach the log (BR-L04). Matched loosely so passwordHash, tokenHash
// and the like are all caught.
const REDACT = ['password', 'token', 'secret', 'hash']

function redact(detail: Record<string, unknown>): Prisma.InputJsonValue {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(detail)) {
    const lower = key.toLowerCase()
    out[key] = REDACT.some((needle) => lower.includes(needle)) ? '[redacted]' : value
  }
  return out as Prisma.InputJsonValue
}

/**
 * Append one row to the client timeline (BR-L01 insert-only, BR-L02 records the full context,
 * BR-L04 redacts secrets). visibleToClient controls whether the couple can see the row (BR-L05).
 */
export async function logActivity(input: {
  clientId?: string | null
  relatedType: string
  relatedId: string
  actorType: ActorType
  actorUserId?: string | null
  action: string
  detail?: Record<string, unknown>
  ipAddress?: string | null
  visibleToClient?: boolean
}): Promise<void> {
  await prisma.activityLog.create({
    data: {
      clientId: input.clientId ?? null,
      relatedType: input.relatedType,
      relatedId: input.relatedId,
      actorType: input.actorType,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      detailJson: redact(input.detail ?? {}),
      ipAddress: input.ipAddress ?? null,
      visibleToClient: input.visibleToClient ?? false,
    },
  })
}
