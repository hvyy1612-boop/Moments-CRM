import { prisma } from '@/lib/db'
import { verifyPassword } from './password'

/**
 * Verify a signed-in user's OWN password, for step-up re-authentication on sensitive pages. Kept in the
 * auth layer (SEC §12.7 / check-passwordhash.mjs allowlist) so route/UI files never touch passwordHash.
 */
export async function verifyUserPassword(userId: string, password: string): Promise<boolean> {
  if (!password) return false
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true, passwordAlgo: true } })
  if (!row) return false
  return verifyPassword(row.passwordHash, row.passwordAlgo, password)
}

const REAUTH_THRESHOLD = 5 // same budget as sign-in (SEC-S04)
const REAUTH_LOCK_MS = 5 * 60 * 1000

/**
 * Re-authentication with the SAME lockout budget as sign-in: a wrong password counts as a failed attempt
 * (atomic increment) and the 5th locks the account for 5 minutes. Used wherever a signed-in session must
 * prove the password (change password, the Activity page fallback), so an unattended session cannot be
 * used to guess it without limit. A correct password clears the counter.
 */
export async function verifyUserPasswordWithLockout(userId: string, password: string, now: Date = new Date()): Promise<'ok' | 'wrong' | 'locked'> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, passwordAlgo: true, failedAttempts: true, lockedUntil: true },
  })
  if (!row) return 'wrong'
  if (row.lockedUntil && row.lockedUntil.getTime() > now.getTime()) return 'locked'
  if (password && (await verifyPassword(row.passwordHash, row.passwordAlgo, password))) {
    if (row.failedAttempts > 0 || row.lockedUntil) await prisma.user.update({ where: { id: userId }, data: { failedAttempts: 0, lockedUntil: null } })
    return 'ok'
  }
  // An expired lock starts a fresh window.
  if (row.lockedUntil) await prisma.user.update({ where: { id: userId }, data: { failedAttempts: 0, lockedUntil: null } })
  const updated = await prisma.user.update({ where: { id: userId }, data: { failedAttempts: { increment: 1 } }, select: { failedAttempts: true } })
  if (updated.failedAttempts >= REAUTH_THRESHOLD) {
    await prisma.user.update({ where: { id: userId }, data: { lockedUntil: new Date(now.getTime() + REAUTH_LOCK_MS) } })
    return 'locked'
  }
  return 'wrong'
}
