import { prisma } from '@/lib/db'
import { systemClock, type Clock } from '@/lib/time'
import { hashPassword, needsRehash, verifyPassword } from './password'
import { createSession, type CreatedSession } from './session'

const LOCKOUT_THRESHOLD = 5
const LOCKOUT_WINDOW_MS = 5 * 60 * 1000
const KNOWN_ADDRESS_MS = 30 * 24 * 60 * 60 * 1000

export type LoginResult = { ok: true; session: CreatedSession } | { ok: false }

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

    const dummy = await dummyHash()
    await verifyPassword(dummy.hash, dummy.algo, input.password)
    return fail(user?.id)
  }

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
