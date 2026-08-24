import { createHash, randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'
import { systemClock, type Clock } from '@/lib/time'
import { checkPasswordPolicy, hashPassword, type PasswordPolicyError } from './password'
import { revokeAllSessions } from './session'

const RESET_TTL_MS = 60 * 60 * 1000

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function newResetToken(): string {
  return randomBytes(32).toString('base64url')
}

export async function requestPasswordReset(
  email: string,
  ip: string,
  clock: Clock = systemClock,
): Promise<{ token: string } | null> {
  const now = clock.now()
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, isActive: true } })
  if (!user || !user.isActive) return null

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
  await prisma.securityEvent.create({
    data: { eventType: 'password_reset_requested', userId: user.id, emailAttempted: email, ipAddress: ip, outcome: 'SUCCESS' },
  })
  return { token }
}

export async function isResetTokenValid(token: string, clock: Clock = systemClock): Promise<boolean> {
  if (!token) return false
  const record = await prisma.passwordReset.findFirst({
    where: { tokenHash: hashToken(token), usedAt: null, expiresAt: { gt: clock.now() } },
    select: { id: true },
  })
  return record != null
}

export type ResetResult = { ok: true } | { ok: false; reason: 'invalid' | PasswordPolicyError }

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
  await prisma.securityEvent.create({
    data: { eventType: 'password_reset_completed', userId: record.userId, ipAddress: ip, outcome: 'SUCCESS' },
  })
  return { ok: true }
}
