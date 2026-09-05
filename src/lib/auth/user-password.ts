import { prisma } from '@/lib/db'
import { hashPassword } from './password'

/**
 * Writing a user's password hash is confined to the auth layer (SEC-P03 / §12.7, enforced by
 * scripts/check-passwordhash.mjs): the literal `passwordHash` must never appear in a route/UI file
 * where data could be serialised to the client. Server actions call these helpers instead of touching
 * the column directly.
 */

/** The password columns for a `user.create`, so a caller can spread them without naming passwordHash. */
export async function passwordCredentials(
  plainPassword: string,
): Promise<{ passwordHash: string; passwordAlgo: string }> {
  const hashed = await hashPassword(plainPassword)
  return { passwordHash: hashed.hash, passwordAlgo: hashed.algo }
}

/** Set a user's own new password and clear the forced-change flag (self-service change). */
export async function setOwnPassword(userId: string, plainPassword: string): Promise<void> {
  const hashed = await hashPassword(plainPassword)
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: hashed.hash, passwordAlgo: hashed.algo, mustChangePassword: false },
  })
}

/** Admin reset: issue a new (temp) password, force a change on next login, and clear any lockout. */
export async function resetUserPassword(userId: string, plainPassword: string): Promise<void> {
  const hashed = await hashPassword(plainPassword)
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: hashed.hash,
      passwordAlgo: hashed.algo,
      mustChangePassword: true,
      failedAttempts: 0,
      lockedUntil: null,
    },
  })
}
