import { createHash, randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'
import { systemClock, type Clock } from '@/lib/time'
import { checkPasswordPolicy, hashPassword, type PasswordPolicyError } from './password'
import { revokeAllSessions } from './session'

/**
 * Self-service password reset (OWASP Forgot Password Cheat Sheet).
 *
 * - The token is 32 random bytes from a CSPRNG; only its SHA-256 hash is stored (like sessions), so a
 *   database read never exposes a usable token.
 * - Tokens are single-use (`usedAt`) and short-lived (60 minutes - OWASP's 15-60 window).
 * - `requestPasswordReset` never reveals whether an account exists: the caller shows the same message
 *   in every case, and no account change is made until a valid token is presented at reset time.
 * - On a successful reset every session is revoked, so a stolen session cannot outlive the reset.
 */
const RESET_TTL_MS = 60 * 60 * 1000 // 60 minutes (OWASP: 15-60)

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function newResetToken(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * Create a reset token for the email if (and only if) an active account exists. Returns the plaintext
 * token once so the caller can email the link; returns null when no token was created. The caller
 * shows the same generic message regardless of the return value (account-existence protection).
 */
export async function requestPasswordReset(
  email: string,
  ip: string,
  clock: Clock = systemClock,
): Promise<{ token: string } | null> {
  const now = clock.now()
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, isActive: true } })
  if (!user || !user.isActive) return null

  // Invalidate any earlier unused tokens so only the latest link works.
  await prisma.passwordReset.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: now },
  })

  const token = newResetToken()
  await prisma.passwordReset.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + RESET_TTL_MS),
      requestedIp: ip,
    },
  })
  await prisma.signInLog.create({
    data: { eventType: 'password_reset_requested', userId: user.id, emailAttempted: email, ipAddress: ip, outcome: 'SUCCESS' },
  })
  return { token }
}

/** Whether a reset token is currently valid (unused and unexpired), for the reset page to decide
 * between showing the form and an "invalid or expired link" message. */
export async function isResetTokenValid(token: string, clock: Clock = systemClock): Promise<boolean> {
  if (!token) return false
  const record = await prisma.passwordReset.findFirst({
    where: { tokenHash: hashToken(token), usedAt: null, expiresAt: { gt: clock.now() } },
    select: { id: true },
  })
  return record != null
}

export type ResetResult = { ok: true } | { ok: false; reason: 'invalid' | PasswordPolicyError }

/**
 * Consume a token and set the new password. Verifies the token (hash match, unused, unexpired),
 * enforces the password policy, hashes with Argon2id, marks the token used, and revokes all of the
 * user's sessions. No account change happens unless the token is valid.
 */
export async function resetPassword(
  token: string,
  newPassword: string,
  ip: string,
  clock: Clock = systemClock,
): Promise<ResetResult> {
  const now = clock.now()
  const record = await prisma.passwordReset.findFirst({
    where: { tokenHash: hashToken(token), usedAt: null, expiresAt: { gt: now } },
    select: { id: true, userId: true },
  })
  if (!record) return { ok: false, reason: 'invalid' }

  const policyError = checkPasswordPolicy(newPassword)
  if (policyError) return { ok: false, reason: policyError }

  const { hash, algo } = await hashPassword(newPassword)
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: hash, passwordAlgo: algo, failedAttempts: 0, lockedUntil: null },
    }),
    prisma.passwordReset.update({ where: { id: record.id }, data: { usedAt: now } }),
  ])
  await revokeAllSessions(record.userId, {}, clock)
  await prisma.signInLog.create({
    data: { eventType: 'password_reset_completed', userId: record.userId, ipAddress: ip, outcome: 'SUCCESS' },
  })
  return { ok: true }
}
