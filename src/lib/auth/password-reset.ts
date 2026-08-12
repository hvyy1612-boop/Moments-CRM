import { createHash, randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'
import { env } from '@/lib/env'
import { queueNotification } from '@/lib/domain/notification'
import { formatSydneyDate, systemClock, type Clock } from '@/lib/time'
import { checkPasswordPolicy, hashPassword } from './password'
import { revokeAllSessions } from './session'

const RESET_TOKEN_TTL_MS = 15 * 60 * 1000
const MAX_PER_ACCOUNT_PER_HOUR = 3
const MAX_PER_IP_PER_HOUR = 10
const HOUR_MS = 60 * 60 * 1000

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export async function requestPasswordReset(
  email: string,
  meta: { ipAddress: string; userAgent?: string | null },
  clock: Clock = systemClock,
): Promise<void> {
  const now = clock.now()
  const hourAgo = new Date(now.getTime() - HOUR_MS)

  const ipRequests = await prisma.securityEvent.count({
    where: { eventType: 'password_reset_requested', ipAddress: meta.ipAddress, createdAt: { gte: hourAgo } },
  })

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, isActive: true },
  })

  let accountLimited = false
  if (user) {
    const accountRequests = await prisma.passwordReset.count({
      where: { userId: user.id, createdAt: { gte: hourAgo } },
    })
    accountLimited = accountRequests >= MAX_PER_ACCOUNT_PER_HOUR
  }
  const limited = ipRequests >= MAX_PER_IP_PER_HOUR || accountLimited

  await prisma.securityEvent.create({
    data: {
      eventType: 'password_reset_requested', // SEC-R08: the request is logged, never the token
      userId: user?.id ?? null,
      emailAttempted: email,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent ?? null,
      outcome: limited ? 'FAILURE' : 'SUCCESS',
    },
  })

  if (!user || !user.isActive || limited) {

    sha256(randomBytes(32).toString('base64url'))
    return
  }

  await prisma.passwordReset.updateMany({
    where: { userId: user.id, usedAt: null, expiresAt: { gt: now } },
    data: { expiresAt: now },
  })

  const token = randomBytes(32).toString('base64url')
  await prisma.passwordReset.create({
    data: {
      userId: user.id,
      tokenHash: sha256(token), // hash only, never the token
      expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
      requestedIp: meta.ipAddress,
    },
  })

  await queueNotification({
    userId: user.id,
    channel: 'EMAIL',
    recipient: user.email,
    templateKey: 'auth.password-reset',
    subject: 'Reset your password',
    bodyText:
      'Someone asked to reset the password for your Moments account. The link below works once ' +
      'and expires in 15 minutes. If this was not you, ignore this email; nothing has changed.\n\n' +
      `${env.NEXT_PUBLIC_APP_URL}/reset-password/${token}`,
    relatedType: 'User',
    relatedId: user.id,
  })
}

export type ResetOutcome = 'done' | 'invalid' | 'too_short' | 'too_common'

export async function completePasswordReset(
  token: string,
  newPassword: string,
  meta: { ipAddress: string; userAgent?: string | null },
  clock: Clock = systemClock,
): Promise<ResetOutcome> {
  const policy = checkPasswordPolicy(newPassword)
  if (policy) return policy

  const now = clock.now()
  const tokenHash = sha256(token)

  const consumed = await prisma.passwordReset.updateMany({
    where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  })
  if (consumed.count !== 1) {
    await prisma.securityEvent.create({
      data: {
        eventType: 'password_reset_completed',
        emailAttempted: null,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent ?? null,
        outcome: 'FAILURE',
      },
    })
    return 'invalid'
  }

  const record = await prisma.passwordReset.findFirst({ where: { tokenHash }, select: { userId: true } })
  if (!record) return 'invalid'

  const hashed = await hashPassword(newPassword)
  await prisma.user.update({
    where: { id: record.userId },
    data: {
      passwordHash: hashed.hash,
      passwordAlgo: hashed.algo,
      passwordChangedAt: now,
      mustChangePassword: false,
      failedAttempts: 0,
      lockedUntil: null,
    },
  })

  await revokeAllSessions(record.userId, {}, clock)

  const user = await prisma.user.findUnique({
    where: { id: record.userId },
    select: { id: true, email: true },
  })
  if (user) {

    await queueNotification({
      userId: user.id,
      channel: 'EMAIL',
      recipient: user.email,
      templateKey: 'auth.password-changed',
      subject: 'Your password was changed',
      bodyText:
        `Your Moments account password was changed on ${formatSydneyDate(now)} (Sydney time) ` +
        `from IP address ${meta.ipAddress}. Every other signed-in session has been signed out. ` +
        'If this was not you, contact the studio owner immediately.',
      relatedType: 'User',
      relatedId: user.id,
    })
  }

  await prisma.securityEvent.create({
    data: {
      eventType: 'password_reset_completed',
      userId: record.userId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent ?? null,
      outcome: 'SUCCESS',
    },
  })
  return 'done'
}
