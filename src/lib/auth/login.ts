import { prisma } from '@/lib/db'
import { systemClock, type Clock } from '@/lib/time'
import { hashPassword, needsRehash, verifyPassword } from './password'
import { createSession, type CreatedSession } from './session'

/**
 * One password login attempt (SEC-S04, SEC-S05, SEC-S06).
 *
 * Every outcome writes a SignInLog. The caller shows one generic failure message for every
 * failure kind, so nothing here reveals whether an account exists, is locked or is disabled
 * (SEC-S05). Lockout is 5 minutes after 5 consecutive failures, counted per account (User
 * counters) and per IP (SignInLog rows in the window - D-005: Postgres is the rate limiter,
 * no new table needed).
 */
const LOCKOUT_THRESHOLD = 5 // SEC-S04
const LOCKOUT_WINDOW_MS = 5 * 60 * 1000 // SEC-S04: 5 minutes
const KNOWN_ADDRESS_MS = 30 * 24 * 60 * 60 * 1000 // an address this account signed in from in the last 30 days

export type LoginResult = { ok: true; session: CreatedSession } | { ok: false }

// A throwaway hash so unknown-account attempts spend the same verification time as wrong-password
// attempts (SEC-S05 timing). Built once per process, on first use.
let dummyHashPromise: Promise<{ hash: string; algo: string }> | null = null
function dummyHash() {
  dummyHashPromise ??= hashPassword('timing-equalisation-dummy-password')
  return dummyHashPromise
}

export async function attemptLogin(
  input: { email: string; password: string; remember: boolean },
  meta: { ipAddress: string; userAgent?: string | null },
  clock: Clock = systemClock,
): Promise<LoginResult> {
  const now = clock.now()
  const windowStart = new Date(now.getTime() - LOCKOUT_WINDOW_MS)

  const fail = async (userId?: string): Promise<LoginResult> => {
    await prisma.signInLog.create({
      data: {
        eventType: 'login_failure', // SEC-S06
        userId: userId ?? null,
        emailAttempted: input.email,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent ?? null,
        outcome: 'FAILURE',
      },
    })
    return { ok: false }
  }

  // SEC-S04 per IP: five failures from one address in the window block further attempts there.
  const ipFailures = await prisma.signInLog.count({
    where: { eventType: 'login_failure', ipAddress: meta.ipAddress, createdAt: { gte: windowStart } },
  })
  if (ipFailures >= LOCKOUT_THRESHOLD) {
    const dummy = await dummyHash()
    await verifyPassword(dummy.hash, dummy.algo, input.password)
    return fail()
  }

  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: {
      id: true,
      passwordHash: true,
      passwordAlgo: true,
      isActive: true,
      failedAttempts: true,
      lockedUntil: true,
    },
  })

  if (!user || !user.isActive) {
    // Unknown or disabled account: spend a real verification anyway (SEC-S05 timing).
    const dummy = await dummyHash()
    await verifyPassword(dummy.hash, dummy.algo, input.password)
    return fail(user?.id)
  }

  // SEC-S04 per account. An active lock refuses without verifying; an expired lock clears its
  // stale counter so the next failure does not instantly re-lock. BR-G12: the lock is on the User,
  // so no sign-in method can bypass it.
  // Lockout-DoS guard: anyone who knows a staff email could otherwise lock that person out on purpose.
  // An address this account has signed in from successfully in the last 30 days is "known" and still
  // gets through the account lock (the per-IP limit above still applies to it), so an attacker
  // elsewhere cannot keep the real user out of their own office or home connection.
  if (user.lockedUntil && user.lockedUntil.getTime() > now.getTime()) {
    const knownAddress = await prisma.signInLog.count({
      where: {
        eventType: 'login_success',
        userId: user.id,
        ipAddress: meta.ipAddress,
        createdAt: { gte: new Date(now.getTime() - KNOWN_ADDRESS_MS) },
      },
    })
    if (knownAddress === 0) {
      const dummy = await dummyHash()
      await verifyPassword(dummy.hash, dummy.algo, input.password)
      return fail(user.id)
    }
  }
  let failedAttempts = user.failedAttempts
  if (user.lockedUntil && user.lockedUntil.getTime() <= now.getTime()) {
    await prisma.user.update({ where: { id: user.id }, data: { failedAttempts: 0, lockedUntil: null } })
    failedAttempts = 0
  }

  const valid = await verifyPassword(user.passwordHash, user.passwordAlgo, input.password)
  if (!valid) {
    const attempts = failedAttempts + 1
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedAttempts: attempts,
        ...(attempts >= LOCKOUT_THRESHOLD
          ? { lockedUntil: new Date(now.getTime() + LOCKOUT_WINDOW_MS) }
          : {}),
      },
    })
    return fail(user.id)
  }

  // SEC-P05: re-hash on login when the stored parameters are weaker than current.
  if (needsRehash(user.passwordHash, user.passwordAlgo)) {
    const rehashed = await hashPassword(input.password)
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: rehashed.hash, passwordAlgo: rehashed.algo },
    })
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: now },
  })

  const session = await createSession(
    user.id,
    { ipAddress: meta.ipAddress, userAgent: meta.userAgent, remember: input.remember },
    clock,
  )
  await prisma.signInLog.create({
    data: {
      eventType: 'login_success', // SEC-S06
      userId: user.id,
      emailAttempted: input.email,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent ?? null,
      outcome: 'SUCCESS',
    },
  })
  return { ok: true, session }
}
