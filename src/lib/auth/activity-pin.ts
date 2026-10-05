import { prisma } from '@/lib/db'
import { hashPassword, verifyPassword } from './password'

/**
 * Step-up PIN for the read-only Activity page. A 4-digit PIN is a low-entropy secret (10,000 combos),
 * so it is only acceptable with server-side rate limiting: it is stored as an Argon2id hash (never plain),
 * checked in constant time by verifyPassword, and locked for a cooling-off period after repeated misses
 * (OWASP "block brute force"). The account password remains a stronger fallback that bypasses the lock.
 */

export const PIN_LENGTH = 4
const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 5 * 60 * 1000 // 5 minutes

/** A PIN is exactly four digits. */
export function isValidPinFormat(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)
}

/** Reject the most guessable PINs (all one digit, or a simple run up/down) so the lockout isn't the only guard. */
export function isWeakPin(pin: string): boolean {
  if (!isValidPinFormat(pin)) return false
  if (/^(\d)\1{3}$/.test(pin)) return true // 0000, 1111, ...
  const RUNS = ['0123', '1234', '2345', '3456', '4567', '5678', '6789', '7890']
  const reversed = pin.split('').reverse().join('')
  return RUNS.includes(pin) || RUNS.includes(reversed)
}

export type ActivityPinStatus = { isSet: boolean; lockedUntil: Date | null }

/** Whether the user has a PIN yet, and (if currently locked out) when the lock lifts. */
export async function getActivityPinStatus(userId: string): Promise<ActivityPinStatus> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { activityPinHash: true, activityPinLockedUntil: true },
  })
  const locked = row?.activityPinLockedUntil ?? null
  return {
    isSet: Boolean(row?.activityPinHash),
    lockedUntil: locked && locked.getTime() > Date.now() ? locked : null,
  }
}

/** Create or replace the user's PIN (hashed) and clear any failed-attempt / lockout state. */
export async function setActivityPin(userId: string, pin: string): Promise<void> {
  const { hash, algo } = await hashPassword(pin)
  await prisma.user.update({
    where: { id: userId },
    data: { activityPinHash: hash, activityPinAlgo: algo, activityPinFailedAttempts: 0, activityPinLockedUntil: null },
  })
}

/** Clear the PIN so the next visit prompts the admin to create a new one (used by the password reset path). */
export async function clearActivityPin(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { activityPinHash: null, activityPinAlgo: null, activityPinFailedAttempts: 0, activityPinLockedUntil: null },
  })
}

export type PinVerifyResult =
  | { ok: true }
  | { ok: false; reason: 'not_set' }
  | { ok: false; reason: 'locked'; lockedUntil: Date }
  | { ok: false; reason: 'wrong'; attemptsLeft: number }

/**
 * Verify a PIN, enforcing the lockout. A correct PIN resets the counter; a wrong one increments it and,
 * once MAX_ATTEMPTS is reached, starts a timed lock. While locked, no guess is even checked.
 */
export async function verifyActivityPin(userId: string, pin: string): Promise<PinVerifyResult> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { activityPinHash: true, activityPinAlgo: true, activityPinFailedAttempts: true, activityPinLockedUntil: true },
  })
  if (!row?.activityPinHash || !row.activityPinAlgo) return { ok: false, reason: 'not_set' }

  const now = Date.now()
  if (row.activityPinLockedUntil && row.activityPinLockedUntil.getTime() > now) {
    return { ok: false, reason: 'locked', lockedUntil: row.activityPinLockedUntil }
  }

  if (await verifyPassword(row.activityPinHash, row.activityPinAlgo, pin)) {
    if (row.activityPinFailedAttempts !== 0 || row.activityPinLockedUntil) {
      await prisma.user.update({ where: { id: userId }, data: { activityPinFailedAttempts: 0, activityPinLockedUntil: null } })
    }
    return { ok: true }
  }

  const attempts = row.activityPinFailedAttempts + 1
  if (attempts >= MAX_ATTEMPTS) {
    const lockedUntil = new Date(now + LOCKOUT_MS)
    await prisma.user.update({ where: { id: userId }, data: { activityPinFailedAttempts: attempts, activityPinLockedUntil: lockedUntil } })
    return { ok: false, reason: 'locked', lockedUntil }
  }
  await prisma.user.update({ where: { id: userId }, data: { activityPinFailedAttempts: attempts } })
  return { ok: false, reason: 'wrong', attemptsLeft: MAX_ATTEMPTS - attempts }
}

type ActivityPinEvent = 'auth.activity_pin_set' | 'auth.activity_pin_reset' | 'auth.activity_password_unlock' | 'auth.activity_password_failed'

/**
 * Record a PIN/step-up security event on the (insert-only) audit trail. Kept in the auth layer next to the
 * user lookup; failures here must never block access, so callers wrap it defensively.
 */
export async function logActivityPinEvent(userId: string, action: ActivityPinEvent): Promise<void> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { companyId: true } })
  await prisma.auditLog.create({
    data: { companyId: row?.companyId ?? null, actorUserId: userId, action, entityType: 'User', entityId: userId, source: 'activity' },
  })
}
