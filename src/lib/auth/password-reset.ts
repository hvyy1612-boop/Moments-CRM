import { createHash, randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'
import { env } from '@/lib/env'
import { queueNotification } from '@/lib/domain/notification'
import { formatSydneyDate, systemClock, type Clock } from '@/lib/time'
import { checkPasswordPolicy, hashPassword } from './password'
import { revokeAllSessions } from './session'

/**
 * Password reset, request and consume (SEC-R01 to SEC-R08).
 *
 * The token is 32 CSPRNG bytes, stored only as a SHA-256 hash, single use, 15 minute expiry
 * (SEC-R02). Requesting changes nothing on the account (SEC-R03). The same code path runs whether
 * or not the account exists and the caller shows one confirmation either way (SEC-R01); delivery
 * itself is asynchronous through the Notification queue (SEC-R08, D4). Events are logged, the
 * token never is (BR-L04, SEC-R08).
 */
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000 // SEC-R02: 15 minutes
const MAX_PER_ACCOUNT_PER_HOUR = 3 // SEC-R07
const MAX_PER_IP_PER_HOUR = 10 // SEC-R07
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

  // SEC-R07 per IP, counted from prior request events (D-005: Postgres as the rate limiter).
  const ipRequests = await prisma.securityEvent.count({
    where: { eventType: 'password_reset_requested', ipAddress: meta.ipAddress, createdAt: { gte: hourAgo } },
  })

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, isActive: true },
  })

  // SEC-R07 per account, counted from stored reset rows.
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
    // Same code path either way (SEC-R01): burn equivalent token work, change nothing, and let the
    // caller show the identical confirmation.
    sha256(randomBytes(32).toString('base64url'))
    return
  }

  // SEC-R05: a new request invalidates every previous unused token for this user.
  await prisma.passwordReset.updateMany({
    where: { userId: user.id, usedAt: null, expiresAt: { gt: now } },
    data: { expiresAt: now },
  })

  const token = randomBytes(32).toString('base64url') // SEC-R02: CSPRNG
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
  const policy = checkPasswordPolicy(newPassword) // SEC-P04 applies to resets too
  if (policy) return policy

  const now = clock.now()
  const tokenHash = sha256(token)

  // SEC-R04: one atomic conditional UPDATE consumes the token; proceed only when exactly one row
  // was affected.
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
  if (!record) return 'invalid' // unreachable after a successful consume; satisfies strict null checks

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

  await revokeAllSessions(record.userId, {}, clock) // SEC-R06: every session goes

  const user = await prisma.user.findUnique({
    where: { id: record.userId },
    select: { id: true, email: true },
  })
  if (user) {
    // SEC-R06: tell the account email, with the time and the requesting IP.
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
