import { createHash, randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'
import { systemClock, type Clock } from '@/lib/time'

/**
 * Server-side sessions (SEC-S01 to SEC-S03, SEC-S07).
 *
 * The token is 32 random bytes from a CSPRNG. Only its SHA-256 hash is stored; the plaintext is
 * returned once for the httpOnly, secure, sameSite=strict cookie set by the caller. Idle timeout is
 * 30 minutes and the absolute timeout is 8 hours (SEC-S02); the "stay signed in for 7 days" option
 * (§8.5) widens both to 7 days. The session id rotates on login by creating a new row and revoking
 * the old one (SEC-S03), handled at the call site.
 */
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
export const ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000 // 8 hours
export const REMEMBER_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000 // "stay signed in for 7 days"

export const SESSION_COOKIE = 'moments_session'

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** SEC-S01: a fresh session token, at least 32 bytes from a CSPRNG, URL-safe for a cookie value. */
export function newSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export type SessionWindow = { expiresAt: Date; absoluteExpiresAt: Date }

/**
 * Pure computation of a session's idle and absolute expiry from the current time (SEC-S02). The idle
 * expiry is never later than the absolute expiry. Kept separate from the database so it can be
 * tested directly with an injected time.
 */
export function sessionWindow(now: Date, remember: boolean): SessionWindow {
  const absoluteMs = remember ? REMEMBER_TIMEOUT_MS : ABSOLUTE_TIMEOUT_MS
  const idleMs = remember ? REMEMBER_TIMEOUT_MS : IDLE_TIMEOUT_MS
  const absoluteExpiresAt = new Date(now.getTime() + absoluteMs)
  const expiresAt = new Date(Math.min(now.getTime() + idleMs, absoluteExpiresAt.getTime()))
  return { expiresAt, absoluteExpiresAt }
}

export type CreatedSession = { token: string; sessionId: string } & SessionWindow

/** Create a session row, storing only the token hash, and return the plaintext token once. */
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

/**
 * Validate a token: the session must exist, not be revoked, and be within both the idle and absolute
 * windows (SEC-S02). A valid check slides the idle window forward, capped at the absolute expiry.
 * Returns null for anything invalid, giving the caller a single generic outcome (SEC-S05).
 */
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
  const nextIdle = new Date(Math.min(now.getTime() + IDLE_TIMEOUT_MS, session.absoluteExpiresAt.getTime()))
  await prisma.session.update({ where: { id: session.id }, data: { expiresAt: nextIdle, lastActiveAt: now } })
  return { userId: session.userId, sessionId: session.id }
}

/** Revoke a single session (SEC-S07 self-service revoke, and logout). */
export async function revokeSession(sessionId: string, clock: Clock = systemClock): Promise<void> {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: clock.now() },
  })
}

/**
 * Revoke every active session for a user, optionally keeping one (SEC-P06 on password change,
 * SEC-R06 on reset). Returns the number of sessions revoked.
 */
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
