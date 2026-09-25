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
