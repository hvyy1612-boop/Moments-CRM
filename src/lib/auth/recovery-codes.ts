import { randomInt } from 'node:crypto'
import { prisma } from '@/lib/db'
import { systemClock, type Clock } from '@/lib/time'
import { hashPassword, PASSWORD_ALGO, verifyPassword } from './password'
import {
  formatRecoveryCode,
  normalizeRecoveryCode,
  RECOVERY_CODE_ALPHABET,
  RECOVERY_CODE_COUNT,
  RECOVERY_CODE_LENGTH,
} from './recovery-code-format'
import { revokeAllSessions } from './session'

/**
 * Self-service password recovery with one-time codes (OWASP Forgot Password: the user proves control of
 * a secret registered in advance). A staff login ID is not a mailbox, so there is nowhere to email a link;
 * instead each account holds six codes, shown once when the staff member sets their own password.
 *
 * - Only an Argon2id hash of each code is stored; a used code is deleted.
 * - A wrong code counts against the SAME lockout as sign-in (5 failures -> 5 minutes) and per IP.
 * - Every outcome is generic to the caller, so the page never reveals which login IDs exist.
 */
const LOCKOUT_THRESHOLD = 5
const LOCKOUT_WINDOW_MS = 5 * 60 * 1000

type Meta = { ipAddress: string; userAgent?: string | null }

function randomCode(): string {
  let raw = ''
  for (let i = 0; i < RECOVERY_CODE_LENGTH; i++) raw += RECOVERY_CODE_ALPHABET[randomInt(RECOVERY_CODE_ALPHABET.length)]
  return raw
}

/** Replace the account's codes with a fresh set. Returns the codes (XXXXX-XXXXX) to show ONCE. */
export async function issueRecoveryCodes(userId: string, meta: Meta): Promise<string[]> {
  const raw = Array.from({ length: RECOVERY_CODE_COUNT }, randomCode)
  const hashes = await Promise.all(raw.map((code) => hashPassword(code)))
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } })
  await prisma.$transaction(async (tx) => {
    await tx.recoveryCode.deleteMany({ where: { userId } }) // a new set cancels the old one
    await tx.recoveryCode.createMany({ data: hashes.map((h) => ({ userId, codeHash: h.hash })) })
    await tx.signInLog.create({
      data: { eventType: 'recovery_codes_created', userId, emailAttempted: user.email, ipAddress: meta.ipAddress, userAgent: meta.userAgent ?? null, outcome: 'SUCCESS' },
    })
  })
  return raw.map(formatRecoveryCode)
}

/** How many unused codes the account still has. */
export function recoveryCodesLeft(userId: string): Promise<number> {
  return prisma.recoveryCode.count({ where: { userId } })
}

// Unknown login IDs spend one verification too, so a miss is not obviously faster.
let dummyHashPromise: Promise<{ hash: string; algo: string }> | null = null
function dummyHash() {
  dummyHashPromise ??= hashPassword('recovery-timing-equalisation')
  return dummyHashPromise
}

export type RecoverResult = { ok: true; codesLeft: number } | { ok: false }

/**
 * Set a new password with a login ID + one recovery code. The new password must already have passed the
 * password policy (the action checks it). On success the code is used up, the lockout clears, the forced
 * change flag clears, and every session is signed out.
 */
export async function resetPasswordWithRecoveryCode(
  input: { loginId: string; code: string; newPassword: string },
  meta: Meta,
  clock: Clock = systemClock,
): Promise<RecoverResult> {
  const now = clock.now()
  const loginId = input.loginId.trim().toLowerCase()
  const code = normalizeRecoveryCode(input.code)

  const fail = async (userId?: string): Promise<RecoverResult> => {
    await prisma.signInLog.create({
      data: { eventType: 'password_recovery_failure', userId: userId ?? null, emailAttempted: loginId || null, ipAddress: meta.ipAddress, userAgent: meta.userAgent ?? null, outcome: 'FAILURE' },
    })
    return { ok: false }
  }

  // Per IP: five failed recoveries in the window block further attempts from that address.
  const ipFailures = await prisma.signInLog.count({
    where: { eventType: 'password_recovery_failure', ipAddress: meta.ipAddress, createdAt: { gte: new Date(now.getTime() - LOCKOUT_WINDOW_MS) } },
  })
  if (ipFailures >= LOCKOUT_THRESHOLD) return fail()

  const user = loginId
    ? await prisma.user.findUnique({
        where: { email: loginId },
        select: { id: true, isActive: true, status: true, failedAttempts: true, lockedUntil: true, recoveryCodes: { select: { id: true, codeHash: true } } },
      })
    : null
  if (!user || !user.isActive || user.status !== 'ACTIVE' || code.length !== 10) {
    const dummy = await dummyHash()
    await verifyPassword(dummy.hash, dummy.algo, code || 'x')
    return fail(user?.id)
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > now.getTime()) return fail(user.id)

  let matchId: string | null = null
  for (const row of user.recoveryCodes) {
    if (await verifyPassword(row.codeHash, PASSWORD_ALGO, code)) {
      matchId = row.id
      break
    }
  }

  if (!matchId) {
    // Same budget as sign-in: an expired lock starts a fresh window; the 5th miss locks 5 minutes.
    const fresh = Boolean(user.lockedUntil)
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { failedAttempts: fresh ? 1 : { increment: 1 }, lockedUntil: null },
      select: { failedAttempts: true },
    })
    if (updated.failedAttempts >= LOCKOUT_THRESHOLD) {
      await prisma.user.update({ where: { id: user.id }, data: { lockedUntil: new Date(now.getTime() + LOCKOUT_WINDOW_MS) } })
    }
    return fail(user.id)
  }

  const hashed = await hashPassword(input.newPassword)
  const usedId = matchId
  // deleteMany on the exact row makes a double submit of the same code a no-op the second time.
  const used = await prisma.$transaction(async (tx) => {
    const del = await tx.recoveryCode.deleteMany({ where: { id: usedId } })
    if (del.count !== 1) return false
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash: hashed.hash, passwordAlgo: hashed.algo, mustChangePassword: false, failedAttempts: 0, lockedUntil: null },
    })
    await tx.signInLog.create({
      data: { eventType: 'password_recovered', userId: user.id, emailAttempted: loginId, ipAddress: meta.ipAddress, userAgent: meta.userAgent ?? null, outcome: 'SUCCESS' },
    })
    return true
  })
  if (!used) return fail(user.id)
  await revokeAllSessions(user.id)
  return { ok: true, codesLeft: await recoveryCodesLeft(user.id) }
}
