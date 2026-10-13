import { createHash, randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'
import { systemClock, type Clock } from '@/lib/time'

export const IDLE_TIMEOUT_MS = 30 * 60 * 1000
export const ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000
export const REMEMBER_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000

export const SESSION_COOKIE = 'moments_session'

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export type SessionWindow = { expiresAt: Date; absoluteExpiresAt: Date }

export function sessionWindow(now: Date, remember: boolean): SessionWindow {
  const absoluteMs = remember ? REMEMBER_TIMEOUT_MS : ABSOLUTE_TIMEOUT_MS
  const idleMs = remember ? REMEMBER_TIMEOUT_MS : IDLE_TIMEOUT_MS
  const absoluteExpiresAt = new Date(now.getTime() + absoluteMs)
  const expiresAt = new Date(Math.min(now.getTime() + idleMs, absoluteExpiresAt.getTime()))
  return { expiresAt, absoluteExpiresAt }
}

export type CreatedSession = { token: string; sessionId: string } & SessionWindow

export async function createSession(
  userId: string,
  meta: { userAgent?: string | null; ipAddress?: string | null; remember?: boolean },
  clock: Clock = systemClock,
): Promise<CreatedSession> {
  const now = clock.now()
  const token = newSessionToken()
  const window = sessionWindow(now, meta.remember ?? false)
  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: window.expiresAt,
      absoluteExpiresAt: window.absoluteExpiresAt,
      lastActiveAt: now,
      userAgent: meta.userAgent ?? null,
      ipAddress: meta.ipAddress ?? null,
    },
  })
  return { token, sessionId: session.id, ...window }
}

export type ValidatedSession = { userId: string; sessionId: string }

export async function validateSession(
  token: string,
  clock: Clock = systemClock,
): Promise<ValidatedSession | null> {
  if (!token) return null
  const now = clock.now()
  const session = await prisma.session.findFirst({ where: { tokenHash: hashToken(token) } })
  if (!session || session.revokedAt) return null
  if (session.absoluteExpiresAt.getTime() <= now.getTime()) return null
  if (session.expiresAt.getTime() <= now.getTime()) return null

  const slid = Math.max(session.expiresAt.getTime(), now.getTime() + IDLE_TIMEOUT_MS)
  const nextIdle = new Date(Math.min(slid, session.absoluteExpiresAt.getTime()))
  await prisma.session.update({ where: { id: session.id }, data: { expiresAt: nextIdle, lastActiveAt: now } })
  return { userId: session.userId, sessionId: session.id }
}

export async function revokeSessionByToken(token: string, clock: Clock = systemClock): Promise<void> {
  await prisma.session.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: clock.now() },
  })
}

export async function revokeAllSessions(
  userId: string,
  opts: { exceptSessionId?: string } = {},
  clock: Clock = systemClock,
): Promise<number> {
  const result = await prisma.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(opts.exceptSessionId ? { id: { not: opts.exceptSessionId } } : {}),
    },
    data: { revokedAt: clock.now() },
  })
  return result.count
}
